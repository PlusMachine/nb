import {
  and,
  brewDevices,
  brewLogEvents,
  brewTelemetry,
  count,
  db,
  desc,
  deviceLogFiles,
  eq,
  gt,
  ilike,
  isNull,
  lte,
  or,
  sql,
  users
} from "@nb/db";

import { isUuid } from "@/lib/uuid";

import { fmtDeviceContactAgo } from "./connection";
import { FIRMWARE_UNKNOWN_KEY, type DevicePresence, type FirmwareVersionOption } from "./contracts";
import { revokeDevice } from "./service";
import type { DeviceStatus } from "./contracts";

// =============================================================================
//  features/devices/admin.ts
//  Админ-выборки по устройствам (/admin/devices): список с фильтрами присутствия
//  и версии прошивки + карточка прибора. Пользовательский service.ts не трогаем —
//  там владельческие сценарии (claim/revoke/история), здесь — сквозной срез парка.
//
//  «В сети» здесь считается ПО ДАВНОСТИ КОНТАКТА, а не по колонке status: status
//  ставится в момент привязки и у брошенного прибора остаётся «online» навсегда
//  (та же причина, что у summarizeDeviceConnection в connection.ts).
//
//  Телеметрия — самая большая таблица в БД: наружу отдаются только последние N
//  строк по индексу (deviceId, ts) и БЕЗ payload (тяжёлый jsonb). Запросов без
//  LIMIT по brew_telemetry здесь нет и быть не должно.
// =============================================================================

/** Прибор считается «в сети», если выходил на связь не дольше этого назад. */
export const DEVICE_ONLINE_WITHIN_MS = 5 * 60_000;

export const DEVICE_TELEMETRY_PREVIEW_LIMIT = 12;
export const DEVICE_EVENTS_PREVIEW_LIMIT = 20;
export const DEVICE_LOG_FILES_LIMIT = 50;
export const ADMIN_DEVICES_PAGE_SIZE = 25;

export type AdminDeviceListItem = {
  id: string;
  name: string;
  hardwareId: string;
  fw: string | null;
  status: DeviceStatus;
  presence: DevicePresence;
  lastSeenAt: Date | null;
  lastContactLabel: string | null;
  createdAt: Date;
  ownerId: string;
  ownerName: string;
  /** E-mail может отсутствовать: регистрация по телефону. */
  ownerEmail: string | null;
  ownerBlocked: boolean;
};

export type AdminDeviceFilters = {
  presence?: DevicePresence;
  fw?: string;
  query?: string;
  page?: number;
};

export type AdminDevicesPage = {
  items: AdminDeviceListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onlineCount: number;
  offlineCount: number;
  fwOptions: FirmwareVersionOption[];
};

export const resolveDevicePresence = (lastSeenAt: Date | null, nowMs: number): DevicePresence =>
  lastSeenAt !== null && nowMs - lastSeenAt.getTime() <= DEVICE_ONLINE_WITHIN_MS ? "online" : "offline";

const normalizePage = (page: number | undefined): number =>
  typeof page === "number" && Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;

/** Экранирование wildcard'ов LIKE: «100%» в поиске не должно матчить всё подряд. */
const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (char) => `\\${char}`);

const buildDeviceWhere = (filters: AdminDeviceFilters, cutoff: Date) => {
  const conditions = [];

  if (filters.presence === "online") {
    conditions.push(gt(brewDevices.lastSeenAt, cutoff));
  } else if (filters.presence === "offline") {
    // Прибор без единого контакта тоже «не в сети» — NULL сравнением не ловится.
    conditions.push(or(isNull(brewDevices.lastSeenAt), lte(brewDevices.lastSeenAt, cutoff)));
  }

  if (filters.fw === FIRMWARE_UNKNOWN_KEY) {
    conditions.push(isNull(brewDevices.fw));
  } else if (filters.fw) {
    conditions.push(eq(brewDevices.fw, filters.fw));
  }

  const query = filters.query?.trim();
  if (query) {
    const pattern = `%${escapeLike(query)}%`;
    conditions.push(
      or(
        ilike(brewDevices.name, pattern),
        ilike(brewDevices.hardwareId, pattern),
        ilike(users.displayName, pattern),
        ilike(users.email, pattern)
      )
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
};

export const listAdminDevices = async (filters: AdminDeviceFilters = {}): Promise<AdminDevicesPage> => {
  const nowMs = Date.now();
  const cutoff = new Date(nowMs - DEVICE_ONLINE_WITHIN_MS);
  const page = normalizePage(filters.page);
  const pageSize = ADMIN_DEVICES_PAGE_SIZE;
  const where = buildDeviceWhere(filters, cutoff);

  const [[totals], [presenceCounts], fwRows, rows] = await Promise.all([
    db.select({ value: count() }).from(brewDevices).leftJoin(users, eq(users.id, brewDevices.userId)).where(where),
    // Счётчики табов — по всему парку, а не по текущему фильтру: иначе таб
    // «Не в сети» показывал бы 0, стоя на табе «В сети».
    db
      .select({
        online: sql<number>`count(*) filter (where ${brewDevices.lastSeenAt} > ${cutoff})`.mapWith(Number),
        offline: sql<number>`count(*) filter (where ${brewDevices.lastSeenAt} is null or ${brewDevices.lastSeenAt} <= ${cutoff})`.mapWith(
          Number
        )
      })
      .from(brewDevices),
    db
      .select({ fw: brewDevices.fw, value: count() })
      .from(brewDevices)
      .groupBy(brewDevices.fw)
      .orderBy(desc(count())),
    db
      .select({
        id: brewDevices.id,
        name: brewDevices.name,
        hardwareId: brewDevices.hardwareId,
        fw: brewDevices.fw,
        status: brewDevices.status,
        lastSeenAt: brewDevices.lastSeenAt,
        createdAt: brewDevices.createdAt,
        ownerId: users.id,
        ownerName: users.displayName,
        ownerEmail: users.email,
        ownerBlockedAt: users.blockedAt
      })
      .from(brewDevices)
      .innerJoin(users, eq(users.id, brewDevices.userId))
      .where(where)
      .orderBy(desc(brewDevices.lastSeenAt), desc(brewDevices.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
  ]);

  const total = totals?.value ?? 0;

  return {
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      hardwareId: row.hardwareId,
      fw: row.fw,
      status: row.status,
      presence: resolveDevicePresence(row.lastSeenAt, nowMs),
      lastSeenAt: row.lastSeenAt,
      lastContactLabel:
        row.lastSeenAt !== null ? fmtDeviceContactAgo(Math.max(0, nowMs - row.lastSeenAt.getTime())) : null,
      createdAt: row.createdAt,
      ownerId: row.ownerId,
      ownerName: row.ownerName,
      ownerEmail: row.ownerEmail,
      ownerBlocked: row.ownerBlockedAt !== null
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    onlineCount: presenceCounts?.online ?? 0,
    offlineCount: presenceCounts?.offline ?? 0,
    fwOptions: fwRows.map((row) => ({
      key: row.fw ?? FIRMWARE_UNKNOWN_KEY,
      label: row.fw ?? "Версия неизвестна",
      count: row.value
    }))
  };
};

export type AdminDeviceTelemetrySample = {
  id: number;
  ts: Date;
  seq: number;
  stage: number | null;
  primaryC: number | null;
  setpointC: number | null;
  heatDutyPct: number | null;
};

export type AdminDeviceEvent = {
  id: string;
  ts: Date;
  type: string;
  payload: Record<string, unknown>;
};

export type AdminDeviceLogFile = {
  id: string;
  name: string;
  sizeBytes: number;
  samplesImported: number;
  eventsImported: number;
  malformedLines: number;
  importedAt: Date;
};

export type AdminDeviceDetail = {
  device: AdminDeviceListItem & {
    providerId: string;
    capabilities: string[];
    localUrl: string | null;
    mqttPrefix: string | null;
    updatedAt: Date;
    /** Токен отозван (или не выдавался) — устройство не может аутентифицироваться. */
    revoked: boolean;
  };
  telemetry: AdminDeviceTelemetrySample[];
  events: AdminDeviceEvent[];
  logFiles: AdminDeviceLogFile[];
  telemetryTotal: number;
};

export const getAdminDevice = async (deviceId: string): Promise<AdminDeviceDetail | null> => {
  // id приходит из сегмента URL: битая ссылка — это 404, а не падение запроса.
  if (!isUuid(deviceId)) {
    return null;
  }

  const nowMs = Date.now();

  const [row] = await db
    .select({
      id: brewDevices.id,
      name: brewDevices.name,
      hardwareId: brewDevices.hardwareId,
      fw: brewDevices.fw,
      status: brewDevices.status,
      lastSeenAt: brewDevices.lastSeenAt,
      createdAt: brewDevices.createdAt,
      updatedAt: brewDevices.updatedAt,
      providerId: brewDevices.providerId,
      capabilities: brewDevices.capabilities,
      localUrl: brewDevices.localUrl,
      mqttPrefix: brewDevices.mqttPrefix,
      tokenHash: brewDevices.tokenHash,
      ownerId: users.id,
      ownerName: users.displayName,
      ownerEmail: users.email,
      ownerBlockedAt: users.blockedAt
    })
    .from(brewDevices)
    .innerJoin(users, eq(users.id, brewDevices.userId))
    .where(eq(brewDevices.id, deviceId))
    .limit(1);

  if (!row) {
    return null;
  }

  const [telemetry, events, logFiles, [telemetryTotals]] = await Promise.all([
    // Без payload: тяжёлый jsonb со снимком каждого кадра, в админке не нужен.
    db
      .select({
        id: brewTelemetry.id,
        ts: brewTelemetry.ts,
        seq: brewTelemetry.seq,
        stage: brewTelemetry.stage,
        primaryC: brewTelemetry.primaryC,
        setpointC: brewTelemetry.setpointC,
        heatDutyPct: brewTelemetry.heatDutyPct
      })
      .from(brewTelemetry)
      .where(eq(brewTelemetry.deviceId, deviceId))
      .orderBy(desc(brewTelemetry.ts))
      .limit(DEVICE_TELEMETRY_PREVIEW_LIMIT),
    db
      .select({
        id: brewLogEvents.id,
        ts: brewLogEvents.ts,
        type: brewLogEvents.type,
        payload: brewLogEvents.payload
      })
      .from(brewLogEvents)
      .where(eq(brewLogEvents.deviceId, deviceId))
      .orderBy(desc(brewLogEvents.ts))
      .limit(DEVICE_EVENTS_PREVIEW_LIMIT),
    db
      .select({
        id: deviceLogFiles.id,
        name: deviceLogFiles.name,
        sizeBytes: deviceLogFiles.sizeBytes,
        samplesImported: deviceLogFiles.samplesImported,
        eventsImported: deviceLogFiles.eventsImported,
        malformedLines: deviceLogFiles.malformedLines,
        importedAt: deviceLogFiles.importedAt
      })
      .from(deviceLogFiles)
      .where(eq(deviceLogFiles.deviceId, deviceId))
      .orderBy(desc(deviceLogFiles.importedAt))
      .limit(DEVICE_LOG_FILES_LIMIT),
    db.select({ value: count() }).from(brewTelemetry).where(eq(brewTelemetry.deviceId, deviceId))
  ]);

  return {
    device: {
      id: row.id,
      name: row.name,
      hardwareId: row.hardwareId,
      fw: row.fw,
      status: row.status,
      presence: resolveDevicePresence(row.lastSeenAt, nowMs),
      lastSeenAt: row.lastSeenAt,
      lastContactLabel:
        row.lastSeenAt !== null ? fmtDeviceContactAgo(Math.max(0, nowMs - row.lastSeenAt.getTime())) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      providerId: row.providerId,
      capabilities: row.capabilities,
      localUrl: row.localUrl,
      mqttPrefix: row.mqttPrefix,
      revoked: row.tokenHash === null,
      ownerId: row.ownerId,
      ownerName: row.ownerName,
      ownerEmail: row.ownerEmail,
      ownerBlocked: row.ownerBlockedAt !== null
    },
    telemetry,
    events,
    logFiles,
    telemetryTotal: telemetryTotals?.value ?? 0
  };
};

/**
 * Отвязать устройство от портала силами админа. Логика отзыва целиком в
 * revokeDevice (обнуление токенов + offline) — она владельческая, поэтому здесь
 * сначала резолвится владелец прибора, а не подставляется id админа.
 */
export const revokeDeviceAsAdmin = async (deviceId: string): Promise<void> => {
  if (!isUuid(deviceId)) {
    throw new Error("NOT_FOUND");
  }

  const [row] = await db
    .select({ userId: brewDevices.userId })
    .from(brewDevices)
    .where(eq(brewDevices.id, deviceId))
    .limit(1);

  if (!row) {
    throw new Error("NOT_FOUND");
  }

  await revokeDevice(row.userId, deviceId);
};
