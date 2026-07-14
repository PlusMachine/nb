// =============================================================================
//  features/devices/tiles.ts
//  L1 командный центр: last-known срез + sparkline по КАЖДОМУ устройству пользователя
//  ОДНИМ оконным запросом на прибор (без per-tile SSE — см. docs/brewery-command-center.md
//  §«Архитектура телеметрии»). Источник для BrewForge — brew_telemetry; для стрим-
//  устройств (docs/specs/third-party-fermentation-devices.md) — отдельный оконный
//  запрос по ferment_readings (иной прибор, иная семантика — не смешиваем таблицы,
//  см. комментарий схемы). lastSeenAt/свежесть считает клиент (nowMs-тик грида).
// =============================================================================
import { db, sql } from "@nb/db";

import { STREAM_PROVIDER_ID } from "@/features/brew-controller/contracts";

import { listUserDevices, isDemoDevice } from "./service";
import { emptySnapshot, snapshotFromRow, type TileRow } from "./tile-snapshot";
import { streamSnapshotFromRow, type StreamTileRow } from "./stream-tile";
import type { DeviceTile, DeviceTileSnapshot, StreamTileSnapshot } from "./contracts";

// Сколько последних точек на устройство тянуть для sparkline (и last-known — первая).
const SPARK_POINTS = 48;

// Строка оконного запроса (snake_case алиасы) — тип и маппинг row→снапшот см.
// tile-snapshot.ts. ВАЖНО: сырой db.execute (drizzle+node-postgres) отдаёт
// timestamptz СТРОКОЙ (в отличие от query-builder, который маппит колонку в
// Date). Поэтому epoch-мс считаем прямо в SQL как double precision (число), а
// не парсим строку в JS. Реалы/инты приходят числами.

/**
 * Плитки командного центра для всех устройств пользователя. Ownership — через
 * listUserDevices (по userId); телеметрию берём лишь по этим deviceId. Устройства
 * без истории телеметрии возвращаются с snapshot=null и пустым spark.
 */
export async function listDeviceTiles(userId: string): Promise<DeviceTile[]> {
  const devices = await listUserDevices(userId);
  if (devices.length === 0) return [];

  const brewforgeDevices = devices.filter((d) => d.providerId !== STREAM_PROVIDER_ID);
  const streamDevices = devices.filter((d) => d.providerId === STREAM_PROVIDER_ID);

  const [byDevice, byStreamDevice] = await Promise.all([
    loadBrewforgeTileData(brewforgeDevices.map((d) => d.id)),
    loadStreamTileData(streamDevices.map((d) => d.id)),
  ]);

  return devices.map((d) => {
    if (d.providerId === STREAM_PROVIDER_ID) {
      const entry = byStreamDevice.get(d.id);
      // hardwareKind живёт на brew_devices (DeviceDto), а не в строке ferment_readings —
      // проставляем его здесь, а не в loadStreamTileData (та не знает вид устройства).
      const streamSnapshot = entry?.snapshot ? { ...entry.snapshot, hardwareKind: d.hardwareKind } : null;
      return {
        id: d.id,
        name: d.name,
        hardwareId: d.hardwareId,
        status: d.status,
        fw: d.fw,
        isDemo: false,
        lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
        kind: "stream",
        snapshot: null,
        streamSnapshot,
        spark: entry?.spark ?? [],
      };
    }

    const entry = byDevice.get(d.id);
    return {
      id: d.id,
      name: d.name,
      hardwareId: d.hardwareId,
      status: d.status,
      fw: d.fw,
      isDemo: isDemoDevice(d),
      lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
      kind: "brewforge",
      snapshot: entry?.snapshot ?? null,
      streamSnapshot: null,
      spark: entry?.spark ?? [],
    };
  });
}

/** Оконный запрос BrewForge-телеметрии (brew_telemetry) — прежнее поведение до расширения. */
async function loadBrewforgeTileData(
  deviceIds: string[],
): Promise<Map<string, { spark: number[]; snapshot: DeviceTileSnapshot }>> {
  const byDevice = new Map<string, { spark: number[]; snapshot: DeviceTileSnapshot }>();
  if (deviceIds.length === 0) return byDevice;

  // Оконный запрос: последние SPARK_POINTS кадров на устройство (oldest→newest),
  // faultMask распаковываем из payload. Один проход по индексу (device_id, ts).
  const idList = sql.join(
    deviceIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const result = await db.execute(sql`
    SELECT device_id,
           (extract(epoch from ts) * 1000)::double precision AS ts_ms,
           stage, primary_c, setpoint_c, heat_duty_pct,
           (payload ->> 'faultMask')::int AS fault_mask,
           (payload ->> 'appMode')::int AS app_mode,
           (payload ->> 'pausedFrom')::int AS paused_from
    FROM (
      SELECT device_id, ts, stage, primary_c, setpoint_c, heat_duty_pct, payload,
             row_number() OVER (PARTITION BY device_id ORDER BY ts DESC) AS rn
      FROM brew_telemetry
      WHERE device_id IN (${idList})
    ) ranked
    WHERE rn <= ${SPARK_POINTS}
    ORDER BY device_id, ts ASC
  `);
  const rows = (result as unknown as { rows: TileRow[] }).rows ?? [];

  // Группируем по устройству (строки уже oldest→newest): sparkline + last-known срез.
  for (const row of rows) {
    let entry = byDevice.get(row.device_id);
    if (!entry) {
      entry = { spark: [], snapshot: emptySnapshot() };
      byDevice.set(row.device_id, entry);
    }
    if (row.primary_c !== null && Number.isFinite(row.primary_c)) {
      entry.spark.push(row.primary_c);
    }
    // Последняя (свежайшая) строка в asc-порядке — last-known срез.
    entry.snapshot = snapshotFromRow(row);
  }
  return byDevice;
}

/**
 * Оконный запрос стрим-телеметрии (ferment_readings) — аналог loadBrewforgeTileData,
 * но source-таблица и набор полей другие (плотность/батарея/RSSI, не стадия/уставка).
 * hardwareKind в снапшот кладём из brewDevices (row не несёт вид устройства).
 */
async function loadStreamTileData(
  deviceIds: string[],
): Promise<Map<string, { spark: number[]; snapshot: StreamTileSnapshot }>> {
  const byDevice = new Map<string, { spark: number[]; snapshot: StreamTileSnapshot }>();
  if (deviceIds.length === 0) return byDevice;

  const idList = sql.join(
    deviceIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const result = await db.execute(sql`
    SELECT device_id,
           (extract(epoch from ts) * 1000)::double precision AS ts_ms,
           gravity_sg, temp_c, battery_v, battery_pct, rssi,
           (payload ->> 'interval')::double precision AS interval_seconds
    FROM (
      SELECT device_id, ts, gravity_sg, temp_c, battery_v, battery_pct, rssi, payload,
             row_number() OVER (PARTITION BY device_id ORDER BY ts DESC) AS rn
      FROM ferment_readings
      WHERE device_id IN (${idList})
    ) ranked
    WHERE rn <= ${SPARK_POINTS}
    ORDER BY device_id, ts ASC
  `);
  const rows = (result as unknown as { rows: StreamTileRow[] }).rows ?? [];

  for (const row of rows) {
    let entry = byDevice.get(row.device_id);
    if (!entry) {
      entry = { spark: [], snapshot: streamSnapshotFromRow(row, null) };
      byDevice.set(row.device_id, entry);
    }
    if (row.gravity_sg !== null && Number.isFinite(row.gravity_sg)) {
      entry.spark.push(row.gravity_sg);
    }
    // Последняя (свежайшая) строка в asc-порядке — last-known срез. hardwareKind
    // здесь всегда null: он проставляется позже из DeviceDto (см. listDeviceTiles).
    entry.snapshot = streamSnapshotFromRow(row, null);
  }
  return byDevice;
}
