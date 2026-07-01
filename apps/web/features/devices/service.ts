import crypto from "node:crypto";

import { createRandomToken, hashToken } from "@nb/auth";
import {
  and,
  brewDevices,
  brewTelemetry,
  db,
  desc,
  devicePairingTokens,
  eq,
  gt,
  isNull
} from "@nb/db";

import {
  TELEMETRY_HISTORY_LIMIT,
  type TelemetryHistoryPoint
} from "@/features/brew-batches/contracts";
import { BREWFORGE_DEMO_PROVIDER_ID } from "@/features/brew-controller/contracts";

import {
  claimDeviceSchema,
  type ClaimDeviceInput,
  type ClaimDeviceResult,
  type CreatePairingCodeInput,
  type DeviceDto,
  type PairingCodeResult,
  type UpdateDeviceStatusInput
} from "./contracts";

// =============================================================================
//  Сервис управления устройствами BrewForge и пэйринга (claim-code → bearer).
//
//  Безопасность токенов (зеркалит sessions/@nb/auth):
//   - bearer-токен = `bfd_` + 32 случайных байта (createRandomToken, CSPRNG);
//   - в БД хранится ТОЛЬКО sha256-хэш (hashToken), как у sessions.token_hash;
//   - plaintext возвращается ровно один раз из claimDevice, нигде не логируется;
//   - при проверке токена сравнение хэшей — constant-time (timingSafeEqual).
//  Все запросы ownership-checked по userId.
// =============================================================================

const DEVICE_TOKEN_PREFIX = "bfd_";
const PAIRING_CODE_TTL_MINUTES = 15;

/** Переменная окружения «включена», если задана непустым не-ложным значением. */
const isEnvEnabled = (value: string | undefined): boolean =>
  value !== undefined && value !== "" && value !== "0" && value.toLowerCase() !== "false";

const defaultDeviceName = (hardwareId: string): string => `BrewForge ${hardwareId}`;

/** Сгенерировать per-device bearer-токен и его хэш для хранения. */
const generateDeviceToken = (): { rawToken: string; tokenHash: string } => {
  const rawToken = `${DEVICE_TOKEN_PREFIX}${createRandomToken(32)}`;
  return { rawToken, tokenHash: hashToken(rawToken) };
};

/** Короткий человекочитаемый claim-код (показывается на LCD/в AP устройства). */
const generateClaimCode = (): string => createRandomToken(4).toUpperCase();

/** Маппинг строки БД → публичный DTO. tokenHash НИКОГДА не попадает наружу. */
const mapDeviceDto = (row: typeof brewDevices.$inferSelect): DeviceDto => ({
  id: row.id,
  userId: row.userId,
  providerId: row.providerId,
  name: row.name,
  hardwareId: row.hardwareId,
  fw: row.fw,
  capabilities: row.capabilities,
  status: row.status,
  localUrl: row.localUrl,
  mqttPrefix: row.mqttPrefix,
  lastSeenAt: row.lastSeenAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const DEMO_HARDWARE_ID_PREFIX = "demo-";

/**
 * Loopback demo-симулятор (реальный device-sim в локальной сети) доступен только
 * вне production (или под явным opt-in) — паритет с egress-гардом transport.ts
 * (assertEgressUrlAllowed: loopback запрещён в проде без BREWFORGE_ALLOW_LOOPBACK_DEVICE).
 * В production демо всё равно доступно — но через in-process стаб-провайдер
 * brewforge-demo (Phase 4.5), а НЕ loopback. См. createDemoDevice.
 */
export const useLoopbackDemoSim = (): boolean =>
  process.env.NODE_ENV !== "production" || isEnvEnabled(process.env.BREWFORGE_ALLOW_LOOPBACK_DEVICE);

/** Демо-устройство метится hardwareId=`demo-<userId>` (и dev-loopback, и prod-стаб). */
export const isDemoDevice = (device: { hardwareId: string }): boolean =>
  device.hardwareId.startsWith(DEMO_HARDWARE_ID_PREFIX);

/**
 * Создать/переиспользовать демо-пивоварню. Идемпотентно на пользователя
 * (hardwareId=`demo-<userId>`). Транспорт выбирается по среде (Phase 0 + 4.5):
 *  - DEV (loopback разрешён): providerId=brewforge + localUrl→локальный device-sim
 *    (полный LAN-путь, «один клик → виртуальный контроллер»);
 *  - PROD (loopback запрещён): providerId=brewforge-demo, БЕЗ localUrl → in-process
 *    SimDevice-стаб (simTransport) — «попробуй до покупки» без железа и без сети.
 * Демо доступно в обеих средах (в проде — не через loopback, а через стаб).
 */
export const createDemoDevice = async (userId: string): Promise<DeviceDto> => {
  const hardwareId = `${DEMO_HARDWARE_ID_PREFIX}${userId}`;
  const loopback = useLoopbackDemoSim();
  const localUrl = loopback
    ? process.env.BREWFORGE_DEMO_SIM_URL?.trim() || "http://127.0.0.1:8090"
    : null;
  const providerId = loopback ? "brewforge" : BREWFORGE_DEMO_PROVIDER_ID;

  const [device] = await db
    .insert(brewDevices)
    .values({
      userId,
      name: "Демо-пивоварня",
      hardwareId,
      providerId,
      localUrl,
      status: "online",
      capabilities: ["telemetry", "manual_control", "recipe_push"]
    })
    .onConflictDoUpdate({
      target: brewDevices.hardwareId,
      set: { userId, providerId, localUrl, status: "online", updatedAt: new Date() },
      setWhere: eq(brewDevices.userId, userId)
    })
    .returning();

  if (!device) {
    throw new Error("DEVICE_OWNED_BY_OTHER_USER");
  }
  return mapDeviceDto(device);
};

export const listUserDevices = async (userId: string): Promise<DeviceDto[]> => {
  const rows = await db.query.brewDevices.findMany({
    where: eq(brewDevices.userId, userId),
    orderBy: [desc(brewDevices.updatedAt)]
  });

  return rows.map(mapDeviceDto);
};

export const getDeviceById = async (userId: string, deviceId: string): Promise<DeviceDto | null> => {
  const row = await db.query.brewDevices.findFirst({
    where: and(eq(brewDevices.id, deviceId), eq(brewDevices.userId, userId))
  });

  return row ? mapDeviceDto(row) : null;
};

/**
 * История телеметрии УСТРОЙСТВА (зона B, пульт L2) — последние N точек по всем
 * партиям устройства (в отличие от batch-истории, скоупленной по brewBatchId).
 * Ownership-checked: сперва сверяем владение устройством, затем тянем историю.
 * Пусто, если устройства нет/оно чужое. oldest→newest для графика.
 */
export const getDeviceHistory = async (
  userId: string,
  deviceId: string,
  limit: number = TELEMETRY_HISTORY_LIMIT
): Promise<TelemetryHistoryPoint[]> => {
  const device = await getDeviceById(userId, deviceId);
  if (!device) {
    return [];
  }
  const bounded = Math.min(Math.max(Math.floor(limit) || 0, 1), TELEMETRY_HISTORY_LIMIT);
  const rows = await db
    .select({
      ts: brewTelemetry.ts,
      primaryC: brewTelemetry.primaryC,
      setpointC: brewTelemetry.setpointC,
      heatDutyPct: brewTelemetry.heatDutyPct,
      stage: brewTelemetry.stage
    })
    .from(brewTelemetry)
    .where(eq(brewTelemetry.deviceId, deviceId))
    .orderBy(desc(brewTelemetry.ts))
    .limit(bounded);

  return rows
    .map((row) => ({
      ts: row.ts.getTime(),
      primaryC: row.primaryC,
      setpointC: row.setpointC,
      heatDutyPct: row.heatDutyPct,
      stage: row.stage
    }))
    .reverse();
};

/**
 * Облачный поток: выпустить одноразовый claim-код. userId опционален — код может
 * выпускаться «в воздух» (устройство показывает его, юзер сдаёт позже) или быть
 * привязан к конкретному пользователю/hardwareId заранее.
 */
export const createPairingCode = async (
  input: CreatePairingCodeInput = {}
): Promise<PairingCodeResult> => {
  const claimCode = generateClaimCode();
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MINUTES * 60 * 1000);

  await db.insert(devicePairingTokens).values({
    claimCode,
    userId: input.userId ?? null,
    hardwareId: input.hardwareId ?? null,
    expiresAt
  });

  return { claimCode, expiresAt };
};

/**
 * Привязать устройство к пользователю и выдать per-device bearer-токен.
 *
 * Безопасность привязки:
 *  - PROOF-OF-POSSESSION: claimCode обязателен по умолчанию. hardwareId — это
 *    заводской идентификатор ('bf-xxxx'), НЕ секрет и легко угадывается, поэтому
 *    «голый» LAN-путь по одному hardwareId (без кода) разрешён ТОЛЬКО под флагом
 *    BREWFORGE_ALLOW_UNVERIFIED_LAN_CLAIM (по умолчанию OFF). Иначе любой
 *    авторизованный пользователь мог бы заклеймить непривязанное устройство,
 *    перебирая hardwareId.
 *  - АТОМАРНОСТЬ (TOCTOU): погашение pairing-кода, проверка владения и upsert
 *    устройства выполняются в ОДНОЙ транзакции. Код гасится условным UPDATE
 *    (`WHERE id=? AND consumed_at IS NULL RETURNING`), а апсерт устройства несёт
 *    предикат владения в WHERE (setWhere userId), поэтому конкурентные клеймы не
 *    могут оба «выиграть».
 *
 * Возвращает DTO + plaintext-токен ОДИН раз. В БД пишется только tokenHash.
 */
export const claimDevice = async (input: ClaimDeviceInput): Promise<ClaimDeviceResult> => {
  const { userId } = input;
  const parsed = claimDeviceSchema.parse({
    claimCode: input.claimCode,
    hardwareId: input.hardwareId,
    name: input.name,
    localUrl: input.localUrl
  });

  // PROOF-OF-POSSESSION: без кода привязка возможна лишь под явным флагом.
  if (!parsed.claimCode && !isEnvEnabled(process.env.BREWFORGE_ALLOW_UNVERIFIED_LAN_CLAIM)) {
    throw new Error("CLAIM_CODE_REQUIRED");
  }

  return db.transaction(async (tx) => {
    const now = new Date();
    let hardwareId = parsed.hardwareId ?? null;

    if (parsed.claimCode) {
      // Блокируем активную (непогашенную/непросроченную) запись кода FOR UPDATE,
      // чтобы конкурентный клейм сериализовался на ней.
      const [row] = await tx
        .select()
        .from(devicePairingTokens)
        .where(
          and(
            eq(devicePairingTokens.claimCode, parsed.claimCode),
            isNull(devicePairingTokens.consumedAt),
            gt(devicePairingTokens.expiresAt, new Date())
          )
        )
        .for("update");

      if (!row) {
        throw new Error("INVALID_CLAIM_CODE");
      }
      // Код, выпущенный под конкретного пользователя, нельзя сдать чужим аккаунтом.
      if (row.userId && row.userId !== userId) {
        throw new Error("CLAIM_CODE_OWNED_BY_OTHER_USER");
      }

      hardwareId = hardwareId ?? row.hardwareId;
      if (!hardwareId) {
        throw new Error("HARDWARE_ID_REQUIRED");
      }

      // Атомарное погашение: гасим РОВНО эту запись и только если ещё не погашена.
      const [consumed] = await tx
        .update(devicePairingTokens)
        .set({ consumedAt: now, userId, hardwareId })
        .where(and(eq(devicePairingTokens.id, row.id), isNull(devicePairingTokens.consumedAt)))
        .returning({ id: devicePairingTokens.id });

      if (!consumed) {
        // Кто-то погасил код между SELECT FOR UPDATE и UPDATE (или гонка) — не клеймим.
        throw new Error("CLAIM_CODE_ALREADY_CONSUMED");
      }
    }

    if (!hardwareId) {
      throw new Error("HARDWARE_ID_REQUIRED");
    }

    // Ранняя дружелюбная ошибка для неконкурентного случая (атомарный бэкстоп ниже —
    // setWhere в апсерте).
    const [existing] = await tx
      .select()
      .from(brewDevices)
      .where(eq(brewDevices.hardwareId, hardwareId))
      .limit(1);

    if (existing && existing.userId !== userId) {
      throw new Error("DEVICE_OWNED_BY_OTHER_USER");
    }

    const { rawToken, tokenHash } = generateDeviceToken();
    const name = parsed.name?.trim() || existing?.name || defaultDeviceName(hardwareId);
    const localUrl = parsed.localUrl ?? existing?.localUrl ?? null;

    // Upsert с предикатом владения в DO UPDATE ... WHERE: при конфликте по чужому
    // устройству setWhere не сматчит → 0 строк в RETURNING → DEVICE_OWNED_BY_OTHER_USER.
    // Конкурентные клеймы нового устройства сериализует уникальный индекс hardwareId.
    const [device] = await tx
      .insert(brewDevices)
      .values({ userId, name, hardwareId, tokenHash, localUrl })
      .onConflictDoUpdate({
        target: brewDevices.hardwareId,
        set: { userId, name, tokenHash, localUrl, updatedAt: now },
        setWhere: eq(brewDevices.userId, userId)
      })
      .returning();

    if (!device) {
      throw new Error("DEVICE_OWNED_BY_OTHER_USER");
    }

    // ВНИМАНИЕ: rawToken отдаётся ровно здесь и нигде не логируется/не сохраняется.
    return { device: mapDeviceDto(device), token: rawToken };
  });
};

/**
 * Найти устройство по предъявленному bearer-токену (точка проверки токена).
 * Сравнение хэшей — constant-time, чтобы не утекало по таймингу.
 */
export const findDeviceByToken = async (rawToken: string): Promise<DeviceDto | null> => {
  if (!rawToken) {
    return null;
  }

  const tokenHash = hashToken(rawToken);
  const [row] = await db.select().from(brewDevices).where(eq(brewDevices.tokenHash, tokenHash));

  if (!row?.tokenHash) {
    return null;
  }

  const stored = Buffer.from(row.tokenHash, "hex");
  const presented = Buffer.from(tokenHash, "hex");
  if (stored.length !== presented.length || !crypto.timingSafeEqual(stored, presented)) {
    return null;
  }

  return mapDeviceDto(row);
};

/**
 * Обновить присутствие устройства (вызывает мост/бридж при коннекте/телеметрии).
 * Ключ — hardwareId (а не userId): источник — само устройство, не UI.
 *
 * ПРЕДУСЛОВИЕ (вызывающий ОБЯЗАН обеспечить): функция доверяет hardwareId и НЕ
 * проверяет владение/аутентификацию. Её можно вызывать ТОЛЬКО после того, как
 * вызывающий аутентифицировал отправителя ИМЕННО как это устройство. На практике
 * hardwareId берётся мостом из ТОПИКА брокера, прошедшего per-device broker-auth
 * (НЕ из тела HTTP-запроса/произвольного ввода). Никогда не вызывать с hardwareId
 * из недоверенного запроса — иначе одно устройство сможет менять статус другого.
 */
export const updateDeviceStatus = async (input: UpdateDeviceStatusInput): Promise<void> => {
  await db
    .update(brewDevices)
    .set({
      status: input.status,
      ...(input.fw !== undefined ? { fw: input.fw } : {}),
      lastSeenAt: input.lastSeenAt ?? new Date(),
      updatedAt: new Date()
    })
    .where(eq(brewDevices.hardwareId, input.hardwareId));
};

/**
 * Отозвать доступ устройства: обнуляем tokenHash (устройство больше не сможет
 * аутентифицироваться) и помечаем offline. История телеметрии сохраняется.
 */
export const revokeDevice = async (userId: string, deviceId: string): Promise<DeviceDto> => {
  const [updated] = await db
    .update(brewDevices)
    .set({ tokenHash: null, status: "offline", updatedAt: new Date() })
    .where(and(eq(brewDevices.id, deviceId), eq(brewDevices.userId, userId)))
    .returning();

  if (!updated) {
    throw new Error("NOT_FOUND");
  }

  return mapDeviceDto(updated);
};
