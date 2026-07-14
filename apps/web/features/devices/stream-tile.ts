// =============================================================================
//  features/devices/stream-tile.ts
//  Чистое ядро сборки last-known среза СТРИМ-устройства для плитки L1 (аналог
//  tile-snapshot.ts, но источник — ferment_readings, а не brew_telemetry). Вынесено
//  отдельно от tiles.ts (тот импортирует @nb/db) — колокированный тест без БД.
// =============================================================================
import { staleThresholdMs } from "@/features/device-streams/normalize-core";

import type { StreamTileSnapshot } from "./contracts";

/** Строка оконного запроса tiles.ts по ferment_readings (snake_case алиасы). */
export type StreamTileRow = {
  device_id: string;
  ts_ms: number;
  gravity_sg: number | null;
  temp_c: number | null;
  battery_v: number | null;
  battery_pct: number | null;
  rssi: number | null;
  /** (payload ->> 'interval')::double precision — сырой интервал репорта устройства, сек. */
  interval_seconds: number | null;
};

/** Строка ranked-запроса (свежайшая на устройство) + вид устройства → снапшот плитки. */
export function streamSnapshotFromRow(row: StreamTileRow, hardwareKind: string | null): StreamTileSnapshot {
  return {
    hardwareKind,
    gravitySg: row.gravity_sg,
    tempC: row.temp_c,
    batteryV: row.battery_v,
    batteryPct: row.battery_pct,
    rssi: row.rssi,
    lastReadingAtMs: Math.round(row.ts_ms),
    staleThresholdMs: staleThresholdMs(row.interval_seconds)
  };
}
