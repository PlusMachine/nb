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
  gte,
  isNull,
  sql,
  users
} from "@nb/db";

import {
  FERMENT_HISTORY_LIMIT,
  TELEMETRY_HISTORY_LIMIT,
  type TelemetryHistoryPoint
} from "@/features/brew-batches/contracts";
import { BREWFORGE_DEMO_PROVIDER_ID } from "@/features/brew-controller/contracts";
import { deviceSupportsRecipePush } from "@/features/brew-controller";
import { pairDeviceOverLan } from "@/features/brew-controller/transport";
import { encryptDeviceToken } from "@/lib/device-token-crypto";

import {
  claimDeviceSchema,
  type ClaimDeviceInput,
  type ClaimDeviceResult,
  type CreatePairingCodeInput,
  type DeviceDto,
  type PairingCodeResult,
  type PairingDeliveryStatus,
  type UpdateDeviceStatusInput
} from "./contracts";
import { isFermenterModeRow } from "./fermenter-binding-core";

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

/**
 * Сгенерировать per-device bearer-токен + его хэш (для сверки, findDeviceByToken)
 * и ОБРАТИМО зашифрованную форму (для повторного использования порталом как
 * Bearer к устройству по LAN — см. lib/device-token-crypto.ts). tokenEncrypted
 * может быть null, если BREWFORGE_DEVICE_TOKEN_ENC_KEY не настроен — тогда LAN-
 * bearer резолвится из env-фолбэка (resolveDeviceToken в brewforge-provider.ts).
 */
const generateDeviceToken = (): { rawToken: string; tokenHash: string; tokenEncrypted: string | null } => {
  const rawToken = `${DEVICE_TOKEN_PREFIX}${createRandomToken(32)}`;
  return { rawToken, tokenHash: hashToken(rawToken), tokenEncrypted: encryptDeviceToken(rawToken) };
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
  supportsRecipePush: deviceSupportsRecipePush(row.providerId),
  status: row.status,
  localUrl: row.localUrl,
  mqttPrefix: row.mqttPrefix,
  hardwareKind: row.hardwareKind,
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
 * (hardwareId=`demo-<userId>`). Транспорт по умолчанию — in-process SimDevice-стаб
 * (providerId=brewforge-demo, БЕЗ localUrl): «попробуй до покупки» работает и в
 * проде, и в dev БЕЗ внешнего device-sim (его нет в `npm run dev` — только ручной
 * `pnpm run dev:sim`), поэтому демо «варит» из коробки везде (UX-находка #16).
 * Реальный LAN-путь через локальный device-sim (providerId=brewforge + localUrl)
 * остаётся для разработчиков под ЯВНЫМ BREWFORGE_ALLOW_LOOPBACK_DEVICE.
 */
export const createDemoDevice = async (userId: string): Promise<DeviceDto> => {
  const hardwareId = `${DEMO_HARDWARE_ID_PREFIX}${userId}`;
  const loopback = isEnvEnabled(process.env.BREWFORGE_ALLOW_LOOPBACK_DEVICE);
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
 *
 * `windowDays` (§14): график «план vs факт» ферментации живёт неделями, а мост
 * персистит FERMENT раз в 300 с (persist-gate.ts) — варочный лимит в 1000 точек
 * укладывается в ~3.5 суток и режет историю на середине брожения. Передан
 * `windowDays` → берём окно по времени (`ts >= now − windowDays`) с более
 * широким потолком (FERMENT_HISTORY_LIMIT); варочные/дистилляционные вызовы
 * (без windowDays) ведут себя ровно как раньше — «последние N точек».
 */
export const getDeviceHistory = async (
  userId: string,
  deviceId: string,
  limit: number = TELEMETRY_HISTORY_LIMIT,
  windowDays?: number
): Promise<TelemetryHistoryPoint[]> => {
  const device = await getDeviceById(userId, deviceId);
  if (!device) {
    return [];
  }
  const hasWindow = typeof windowDays === "number" && windowDays > 0;
  const cap = hasWindow ? FERMENT_HISTORY_LIMIT : TELEMETRY_HISTORY_LIMIT;
  const bounded = Math.min(Math.max(Math.floor(limit) || 0, 1), cap);

  const conditions = [eq(brewTelemetry.deviceId, deviceId)];
  if (hasWindow) {
    conditions.push(gte(brewTelemetry.ts, new Date(Date.now() - windowDays! * 86_400_000)));
  }

  const rows = await db
    .select({
      ts: brewTelemetry.ts,
      primaryC: brewTelemetry.primaryC,
      setpointC: brewTelemetry.setpointC,
      heatDutyPct: brewTelemetry.heatDutyPct,
      stage: brewTelemetry.stage
    })
    .from(brewTelemetry)
    .where(and(...conditions))
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
 * Last-known режим устройства (appMode/stage последнего кадра телеметрии) — для
 * решения «какое окно истории грузить на пульт L2» (§14: ferment vs варка/
 * дистилляция) БЕЗ живой SSE-подписки (серверный рендер page.tsx её не имеет).
 * Тот же приём одного last-known среза, что listFermenterCandidates
 * (fermenter-binding.ts), но для одного deviceId. Ownership-checked. null —
 * истории ещё нет (устройство ни разу не присылало телеметрию).
 */
export const getLastKnownDeviceMode = async (
  userId: string,
  deviceId: string
): Promise<{ appMode: number | null; stage: number | null } | null> => {
  const device = await getDeviceById(userId, deviceId);
  if (!device) return null;

  const result = await db.execute(sql`
    SELECT stage, (payload ->> 'appMode')::int AS app_mode
    FROM brew_telemetry
    WHERE device_id = ${deviceId}
    ORDER BY ts DESC
    LIMIT 1
  `);
  const row = (result as unknown as { rows: { stage: number | null; app_mode: number | null }[] }).rows?.[0];
  return row ? { appMode: row.app_mode, stage: row.stage } : null;
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
 * Возвращает DTO + plaintext-токен ОДИН раз. В БД пишется tokenHash (сверка) +
 * tokenEncrypted (обратимо, для LAN bearer-auth — см. lib/device-token-crypto.ts),
 * НИКОГДА plaintext. При наличии localUrl СРАЗУ же best-effort пытается доставить
 * токен устройству по LAN (POST /pair, P4) — итог в `pairing` результата; неудача
 * доставки НЕ откатывает сам клейм (см. deliverPairingToken).
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

  const claimed = await db.transaction(async (tx) => {
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

    const { rawToken, tokenHash, tokenEncrypted } = generateDeviceToken();
    const name = parsed.name?.trim() || existing?.name || defaultDeviceName(hardwareId);
    const localUrl = parsed.localUrl ?? existing?.localUrl ?? null;

    // Upsert с предикатом владения в DO UPDATE ... WHERE: при конфликте по чужому
    // устройству setWhere не сматчит → 0 строк в RETURNING → DEVICE_OWNED_BY_OTHER_USER.
    // Конкурентные клеймы нового устройства сериализует уникальный индекс hardwareId.
    const [device] = await tx
      .insert(brewDevices)
      .values({ userId, name, hardwareId, tokenHash, tokenEncrypted, localUrl })
      .onConflictDoUpdate({
        target: brewDevices.hardwareId,
        set: { userId, name, tokenHash, tokenEncrypted, localUrl, updatedAt: now },
        setWhere: eq(brewDevices.userId, userId)
      })
      .returning();

    if (!device) {
      throw new Error("DEVICE_OWNED_BY_OTHER_USER");
    }

    // ВНИМАНИЕ: rawToken отдаётся ровно здесь и нигде не логируется/не сохраняется.
    return { device: mapDeviceDto(device), token: rawToken };
  });

  // --- P4: доставка токена НА устройство по LAN (POST {localUrl}/pair). -------
  // СОЗНАТЕЛЬНО ВНЕ транзакции БД выше: сетевой запрос к устройству не должен
  // держать открытой транзакцию/локи Postgres. Устройство+токен УЖЕ созданы
  // независимо от исхода доставки — неудача здесь НЕ откатывает claimDevice
  // (токен всё равно возвращён пользователю один раз и может быть введён вручную
  // через /provision или повторный /pair, когда устройство станет достижимо).
  const pairing = await deliverPairingToken(claimed.device.localUrl, claimed.token);
  return { ...claimed, pairing };
};

/**
 * Доставить только что выданный pairing-токен устройству по его LAN-адресу
 * (best-effort; ошибки НЕ бросаются наружу — см. вызывающий claimDevice).
 *  - нет localUrl (облачный/ещё не в сети клейм) → NO_LOCAL_URL, это НЕ ошибка;
 *  - устройство уже сопряжено (409 ALREADY_PAIRED) → сообщение для UI: сброс
 *    привязки — ТОЛЬКО локально на плате (Setup → «Удалённо»), сетевого пути нет;
 *  - сеть недоступна/устройство offline → UNREACHABLE (пользователь донесёт
 *    токен вручную, когда устройство появится в сети).
 */
async function deliverPairingToken(
  localUrl: string | null,
  rawToken: string
): Promise<PairingDeliveryStatus> {
  if (!localUrl) {
    return { delivered: false, reason: "NO_LOCAL_URL" };
  }
  const result = await pairDeviceOverLan(localUrl, rawToken);
  if (result.ok) {
    return { delivered: true };
  }
  return { delivered: false, reason: result.reason };
}

/**
 * Найти устройство по предъявленному bearer-токену (точка проверки токена).
 * Сравнение хэшей — constant-time, чтобы не утекало по таймингу.
 *
 * Устройства авторизуются токеном, а НЕ сессией, поэтому проверка блокировки из
 * getUserBySessionToken их не закрывает: владельца проверяем здесь, иначе
 * пивоварня забаненного продолжит слать телеметрию и качать OTA.
 */
export const findDeviceByToken = async (rawToken: string): Promise<DeviceDto | null> => {
  if (!rawToken) {
    return null;
  }

  const tokenHash = hashToken(rawToken);
  const [row] = await db
    .select({ device: brewDevices, ownerBlockedAt: users.blockedAt, ownerAnonymizedAt: users.anonymizedAt })
    .from(brewDevices)
    .innerJoin(users, eq(users.id, brewDevices.userId))
    .where(eq(brewDevices.tokenHash, tokenHash));

  if (!row?.device.tokenHash) {
    return null;
  }

  const stored = Buffer.from(row.device.tokenHash, "hex");
  const presented = Buffer.from(tokenHash, "hex");
  if (stored.length !== presented.length || !crypto.timingSafeEqual(stored, presented)) {
    return null;
  }

  if (row.ownerBlockedAt !== null || row.ownerAnonymizedAt !== null) {
    return null;
  }

  return mapDeviceDto(row.device);
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
/**
 * Время самого свежего сохранённого кадра телеметрии устройства (мс epoch) или
 * null. Дёшево: один проход по индексу (device_id, ts). Нужен статичным
 * поверхностям (настройки), чтобы считать «связь» из того же источника, что и
 * список плиток, а не расходиться с ним (UX-находка #14).
 */
export const getLatestTelemetryAtMs = async (deviceId: string): Promise<number | null> => {
  const [row] = await db
    .select({ ts: brewTelemetry.ts })
    .from(brewTelemetry)
    .where(eq(brewTelemetry.deviceId, deviceId))
    .orderBy(desc(brewTelemetry.ts))
    .limit(1);
  return row?.ts ? row.ts.getTime() : null;
};

/**
 * Последний сохранённый кадр телеметрии кратко: время + стадия (bf_stage_t).
 * Тот же источник, что getLatestTelemetryAtMs, но со стадией — нужен блоку
 * «Прошивка» настроек (кнопка «Обновить» доступна только в IDLE, F3 §6).
 */
export const getLatestTelemetryBrief = async (
  deviceId: string
): Promise<{ tsMs: number; stage: number | null } | null> => {
  const [row] = await db
    .select({ ts: brewTelemetry.ts, stage: brewTelemetry.stage })
    .from(brewTelemetry)
    .where(eq(brewTelemetry.deviceId, deviceId))
    .orderBy(desc(brewTelemetry.ts))
    .limit(1);
  return row?.ts ? { tsMs: row.ts.getTime(), stage: row.stage } : null;
};

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
 * Отозвать доступ устройства НА ПОРТАЛЕ: обнуляем tokenHash/tokenEncrypted
 * (устройство больше не сможет аутентифицироваться К порталу/мосту, а портал
 * больше не сможет предъявить bearer УСТРОЙСТВУ по LAN) и помечаем offline.
 * История телеметрии сохраняется. ⚠ Это НЕ трогает device_token НА САМОЙ плате —
 * та половина сопряжения рвётся ТОЛЬКО локально (Setup → «Удалённо» → «Отвязать
 * устройство», bf_comms_unpair) — см. комментарий в pairDeviceOverLan/CLAUDE.md.
 * После revokeDevice портал не сможет управлять устройством, ПОКА пользователь
 * не привяжет его заново (новый claimCode + POST /pair — устройство своей стороны
 * сопряжения не помнит, если только не был выполнен и локальный разрыв тоже).
 */
export const revokeDevice = async (userId: string, deviceId: string): Promise<DeviceDto> => {
  const [updated] = await db
    .update(brewDevices)
    .set({ tokenHash: null, tokenEncrypted: null, status: "offline", updatedAt: new Date() })
    .where(and(eq(brewDevices.id, deviceId), eq(brewDevices.userId, userId)))
    .returning();

  if (!updated) {
    throw new Error("NOT_FOUND");
  }

  return mapDeviceDto(updated);
};
