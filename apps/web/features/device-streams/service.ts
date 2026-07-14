import crypto from "node:crypto";

import { assertRateLimit, createRandomToken, hashToken } from "@nb/auth";
import { and, brewDevices, count, db, desc, eq, fermentReadings, fermentSessions, inArray } from "@nb/db";

import { STREAM_PROVIDER_ID } from "@/features/brew-controller/contracts";
import { decryptDeviceToken, encryptDeviceToken } from "@/lib/device-token-crypto";
import { getServerEnv } from "@/lib/env";

import {
  connectStreamDeviceSchema,
  MAX_STREAM_DEVICES_PER_USER,
  renameStreamDeviceSchema,
  setStreamDeviceKindSchema,
  STREAM_DEVICE_CREATE_RATE_LIMIT,
  STREAM_DEVICE_CREATE_RATE_WINDOW_SECONDS,
  STREAM_LIKE_PROVIDER_IDS,
  type ConnectStreamDeviceInput,
  type ConnectStreamDeviceResult,
  type StreamDeviceDataCounts,
  type StreamDeviceDto,
  type StreamDeviceStatusDto,
  type StreamHardwareKind,
  type StreamLatestReadingDto
} from "./contracts";
import { isStale as isReadingStale } from "./normalize-core";
import { buildIngestUrl, extractIntervalSeconds } from "./stream-device-core";

// =============================================================================
//  features/device-streams — service.ts
//  CRUD стрим-устройств (iSpindel, GravityMon, Tilt, Floaty, BrewPiLess, …) + чтение
//  живого статуса приёма. Зеркалит паттерны features/devices/service.ts (claimDevice):
//  токены — createRandomToken/hashToken (sha256, сверка) + encryptDeviceToken
//  (AES-256-GCM, обратимо — повторный показ URL устройству), квоты — assertRateLimit
//  + count по существующему атомарному барьеру (см. brew-batches/service.ts
//  assertBrewBatchCreationAllowed). Ownership (чтение/переименование/смена вида/
//  удаление/статус) — по (userId, providerId ∈ STREAM_LIKE_PROVIDER_IDS = 'stream'
//  | 'rapt-cloud', M4-B): RAPT-устройства ведут себя как стрим-устройства везде,
//  КРОМЕ создания — их создаёт только ingest-rapt.ts (автообнаружение по вебхуку),
//  поэтому createStreamDevice/квота ниже намеренно остаются на STREAM_PROVIDER_ID
//  (это генерик-визард «Поплавок/датчик», RAPT туда руками не заводится, §5 F1-RAPT).
//  Чужой providerId (BrewForge-устройство под чужим id) не должен быть виден отсюда,
//  поэтому getOwnedDeviceRow фильтрует по обоим.
//
//  Ingest (парсинг пакетов, запись в ferment_readings) — features/device-streams/
//  ingest.ts, ЧУЖОЙ модуль (параллельный исполнитель) — сюда не заходим и не
//  дублируем его логику; этот файл — только устройства/сеансы/чтение статуса.
// =============================================================================

/** Ownership-строка brew_devices: устройство существует, принадлежит userId и это стрим-подобное устройство (stream|rapt-cloud). */
const getOwnedDeviceRow = async (userId: string, deviceId: string): Promise<typeof brewDevices.$inferSelect> => {
  const row = await db.query.brewDevices.findFirst({
    where: and(
      eq(brewDevices.id, deviceId),
      eq(brewDevices.userId, userId),
      inArray(brewDevices.providerId, [...STREAM_LIKE_PROVIDER_IDS])
    )
  });
  if (!row) {
    throw new Error("NOT_FOUND");
  }
  return row;
};

const mapStreamDeviceRow = (row: typeof brewDevices.$inferSelect): StreamDeviceDto => ({
  id: row.id,
  userId: row.userId,
  name: row.name,
  hardwareId: row.hardwareId,
  hardwareKind: (row.hardwareKind as StreamHardwareKind | null) ?? null,
  status: row.status,
  lastSeenAt: row.lastSeenAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

/** Сгенерировать ingest-токен: raw (в URL устройства) + sha256-хэш (сверка) + AES-256-GCM (повторный показ). */
const generateIngestToken = (): { rawToken: string; tokenHash: string; tokenEncrypted: string | null } => {
  const rawToken = createRandomToken(32);
  return { rawToken, tokenHash: hashToken(rawToken), tokenEncrypted: encryptDeviceToken(rawToken) };
};

/** hardwareId стрим-устройства: `st-<12 hex>` (6 случайных байт), см. §6.1 ТЗ. */
const generateStreamHardwareId = (): string => `st-${crypto.randomBytes(6).toString("hex")}`;

/**
 * Создать стрим-устройство (F1, «Поплавок/датчик»). Квота (§8.5): rate limit на
 * скрипт-флуд + count(providerId=stream) против MAX_STREAM_DEVICES_PER_USER —
 * бросает STREAM_DEVICE_QUOTA_REACHED (экшен маппит в сообщение). Токен возвращается
 * в открытом виде ОДИН раз через ingestUrl; в БД — только tokenHash/tokenEncrypted.
 */
export const createStreamDevice = async (
  userId: string,
  input: ConnectStreamDeviceInput
): Promise<ConnectStreamDeviceResult> => {
  const parsed = connectStreamDeviceSchema.parse(input);

  await assertRateLimit(userId, "stream_device_create", STREAM_DEVICE_CREATE_RATE_LIMIT, STREAM_DEVICE_CREATE_RATE_WINDOW_SECONDS);

  const [row] = await db
    .select({ value: count() })
    .from(brewDevices)
    .where(and(eq(brewDevices.userId, userId), eq(brewDevices.providerId, STREAM_PROVIDER_ID)));
  if ((row?.value ?? 0) >= MAX_STREAM_DEVICES_PER_USER) {
    throw new Error("STREAM_DEVICE_QUOTA_REACHED");
  }

  const { rawToken, tokenHash, tokenEncrypted } = generateIngestToken();

  const [device] = await db
    .insert(brewDevices)
    .values({
      userId,
      providerId: STREAM_PROVIDER_ID,
      name: parsed.name,
      hardwareId: generateStreamHardwareId(),
      hardwareKind: parsed.kind,
      tokenHash,
      tokenEncrypted,
      capabilities: ["fermentation_logging"],
      status: "unknown"
    })
    .returning();

  if (!device) {
    throw new Error("STREAM_DEVICE_CREATE_FAILED");
  }

  const { APP_URL } = getServerEnv();
  return { device: mapStreamDeviceRow(device), ingestUrl: buildIngestUrl(APP_URL, rawToken) };
};

export const listUserStreamDevices = async (userId: string): Promise<StreamDeviceDto[]> => {
  const rows = await db.query.brewDevices.findMany({
    where: and(eq(brewDevices.userId, userId), eq(brewDevices.providerId, STREAM_PROVIDER_ID))
  });
  return rows.map(mapStreamDeviceRow);
};

export const getStreamDeviceById = async (userId: string, deviceId: string): Promise<StreamDeviceDto | null> => {
  const row = await db.query.brewDevices.findFirst({
    where: and(
      eq(brewDevices.id, deviceId),
      eq(brewDevices.userId, userId),
      eq(brewDevices.providerId, STREAM_PROVIDER_ID)
    )
  });
  return row ? mapStreamDeviceRow(row) : null;
};

/**
 * URL для повторного показа («Показать URL», F8). null — ключ шифрования
 * (BREWFORGE_DEVICE_TOKEN_ENC_KEY) не настроен ИЛИ значение повреждено — UI в
 * этом случае предлагает «Перевыпустить URL» (rotateStreamToken).
 */
export const getStreamIngestUrl = async (userId: string, deviceId: string): Promise<string | null> => {
  const device = await getOwnedDeviceRow(userId, deviceId);
  if (!device.tokenEncrypted) {
    return null;
  }
  const rawToken = decryptDeviceToken(device.tokenEncrypted);
  if (!rawToken) {
    return null;
  }
  const { APP_URL } = getServerEnv();
  return buildIngestUrl(APP_URL, rawToken);
};

/**
 * Перевыпустить ingest-токен (F8): старый умирает сразу (перезапись tokenHash/
 * tokenEncrypted), новый URL возвращается из СВЕЖЕГО rawToken (не из decrypt) —
 * поэтому работает даже если ключ шифрования не настроен (следующий показ до
 * следующей ротации будет недоступен, см. getStreamIngestUrl).
 */
export const rotateStreamToken = async (userId: string, deviceId: string): Promise<string> => {
  await getOwnedDeviceRow(userId, deviceId);

  const { rawToken, tokenHash, tokenEncrypted } = generateIngestToken();
  const [updated] = await db
    .update(brewDevices)
    .set({ tokenHash, tokenEncrypted, updatedAt: new Date() })
    .where(
      and(
        eq(brewDevices.id, deviceId),
        eq(brewDevices.userId, userId),
        inArray(brewDevices.providerId, [...STREAM_LIKE_PROVIDER_IDS])
      )
    )
    .returning({ id: brewDevices.id });
  if (!updated) {
    throw new Error("NOT_FOUND");
  }

  const { APP_URL } = getServerEnv();
  return buildIngestUrl(APP_URL, rawToken);
};

/**
 * Живой статус приёма (F1 живая зона + /api/devices/[id]/stream-status поллинг):
 * последняя точка (для сводки), счётчик точек (для «Ждём первый пакет…» vs готово)
 * и ветхость (§П4, isStale из normalize-core по интервалу последней точки).
 */
export const getStreamDeviceStatus = async (userId: string, deviceId: string): Promise<StreamDeviceStatusDto> => {
  const device = await getOwnedDeviceRow(userId, deviceId);

  const [[latestRow], [countRow]] = await Promise.all([
    db
      .select({
        ts: fermentReadings.ts,
        gravitySg: fermentReadings.gravitySg,
        tempC: fermentReadings.tempC,
        batteryV: fermentReadings.batteryV,
        batteryPct: fermentReadings.batteryPct,
        rssi: fermentReadings.rssi,
        payload: fermentReadings.payload
      })
      .from(fermentReadings)
      .where(eq(fermentReadings.deviceId, device.id))
      .orderBy(desc(fermentReadings.ts))
      .limit(1),
    db.select({ value: count() }).from(fermentReadings).where(eq(fermentReadings.deviceId, device.id))
  ]);

  const latestReading: StreamLatestReadingDto | null = latestRow
    ? {
        ts: latestRow.ts,
        gravitySg: latestRow.gravitySg,
        tempC: latestRow.tempC,
        batteryV: latestRow.batteryV,
        batteryPct: latestRow.batteryPct,
        rssi: latestRow.rssi
      }
    : null;

  const lastSeenAt = latestRow?.ts ?? device.lastSeenAt ?? null;
  const intervalSeconds = extractIntervalSeconds(latestRow?.payload);

  return {
    lastSeenAt,
    latestReading,
    readingsCount: countRow?.value ?? 0,
    isStale: isReadingStale(lastSeenAt, intervalSeconds, new Date())
  };
};

/** Точки + сеансы устройства (без удаления) — для описания в ConfirmActionDialog. */
const countDeviceData = async (deviceId: string): Promise<StreamDeviceDataCounts> => {
  const [[readingsRow], [sessionsRow]] = await Promise.all([
    db.select({ value: count() }).from(fermentReadings).where(eq(fermentReadings.deviceId, deviceId)),
    db.select({ value: count() }).from(fermentSessions).where(eq(fermentSessions.deviceId, deviceId))
  ]);
  return { readingsCount: readingsRow?.value ?? 0, sessionsCount: sessionsRow?.value ?? 0 };
};

/** Точки/сеансы устройства для диалога подтверждения удаления (без самого удаления). */
export const getStreamDeviceDataCounts = async (userId: string, deviceId: string): Promise<StreamDeviceDataCounts> => {
  const device = await getOwnedDeviceRow(userId, deviceId);
  return countDeviceData(device.id);
};

/**
 * Удалить стрим-устройство целиком (F8): каскад БД (onDelete: cascade на
 * ferment_sessions/ferment_readings) сносит точки и сеансы. Возвращает то, что
 * было удалено — счётчики уже посчитаны ДО DELETE (после — они были бы 0).
 */
export const deleteStreamDevice = async (userId: string, deviceId: string): Promise<StreamDeviceDataCounts> => {
  const device = await getOwnedDeviceRow(userId, deviceId);
  const counts = await countDeviceData(device.id);

  await db
    .delete(brewDevices)
    .where(
      and(
        eq(brewDevices.id, deviceId),
        eq(brewDevices.userId, userId),
        inArray(brewDevices.providerId, [...STREAM_LIKE_PROVIDER_IDS])
      )
    );

  return counts;
};

export const renameStreamDevice = async (userId: string, deviceId: string, name: string): Promise<StreamDeviceDto> => {
  const parsed = renameStreamDeviceSchema.parse({ name });
  await getOwnedDeviceRow(userId, deviceId);

  const [updated] = await db
    .update(brewDevices)
    .set({ name: parsed.name, updatedAt: new Date() })
    .where(
      and(
        eq(brewDevices.id, deviceId),
        eq(brewDevices.userId, userId),
        inArray(brewDevices.providerId, [...STREAM_LIKE_PROVIDER_IDS])
      )
    )
    .returning();
  if (!updated) {
    throw new Error("NOT_FOUND");
  }
  return mapStreamDeviceRow(updated);
};

export const setStreamDeviceKind = async (
  userId: string,
  deviceId: string,
  kind: StreamHardwareKind
): Promise<StreamDeviceDto> => {
  const parsed = setStreamDeviceKindSchema.parse({ kind });
  await getOwnedDeviceRow(userId, deviceId);

  const [updated] = await db
    .update(brewDevices)
    .set({ hardwareKind: parsed.kind, updatedAt: new Date() })
    .where(
      and(
        eq(brewDevices.id, deviceId),
        eq(brewDevices.userId, userId),
        inArray(brewDevices.providerId, [...STREAM_LIKE_PROVIDER_IDS])
      )
    )
    .returning();
  if (!updated) {
    throw new Error("NOT_FOUND");
  }
  return mapStreamDeviceRow(updated);
};
