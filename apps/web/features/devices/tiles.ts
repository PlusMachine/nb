// =============================================================================
//  features/devices/tiles.ts
//  L1 командный центр: last-known срез + sparkline по КАЖДОМУ устройству пользователя
//  ОДНИМ оконным запросом (без per-tile SSE — см. docs/brewery-command-center.md
//  §«Архитектура телеметрии»). Источник — brew_telemetry (что накопил общий поллер,
//  пока кто-то держал пульт/дашборд) + lastSeenAt; свежесть считает клиент.
// =============================================================================
import { db, sql } from "@nb/db";

import { listUserDevices, isDemoDevice } from "./service";
import { emptySnapshot, snapshotFromRow, type TileRow } from "./tile-snapshot";
import type { DeviceTile, DeviceTileSnapshot } from "./contracts";

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

  const deviceIds = devices.map((d) => d.id);

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
  const byDevice = new Map<string, { spark: number[]; snapshot: DeviceTileSnapshot }>();
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

  return devices.map((d) => {
    const entry = byDevice.get(d.id);
    return {
      id: d.id,
      name: d.name,
      hardwareId: d.hardwareId,
      status: d.status,
      fw: d.fw,
      isDemo: isDemoDevice(d),
      lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
      snapshot: entry?.snapshot ?? null,
      spark: entry?.spark ?? [],
    };
  });
}
