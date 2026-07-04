// =============================================================================
//  features/devices/tile-snapshot.ts
//  Чистое ядро сборки last-known среза плитки L1 из строки оконного SQL-запроса
//  (tiles.ts). Вынесено ОТДЕЛЬНО от tiles.ts, который импортирует @nb/db —
//  колокированные тесты features/** идут без БД (см. apps/web/vitest.config.ts),
//  поэтому маппинг строка→снапшот должен жить в модуле без побочных импортов.
// =============================================================================
import type { DeviceTileSnapshot } from "./contracts";

/** Строка оконного запроса tiles.ts (snake_case алиасы, см. комментарий там). */
export type TileRow = {
  device_id: string;
  ts_ms: number;
  stage: number | null;
  primary_c: number | null;
  setpoint_c: number | null;
  heat_duty_pct: number | null;
  fault_mask: number | null;
  app_mode: number | null;
  paused_from: number | null;
};

/** Срез «истории ещё нет» — устройство без телеметрии вовсе. */
export function emptySnapshot(): DeviceTileSnapshot {
  return {
    ts: 0,
    stage: null,
    primaryC: null,
    setpointC: null,
    heatDutyPct: null,
    faultMask: 0,
    appMode: null,
    pausedFrom: null,
  };
}

/** Строка ranked-запроса (свежайшая на устройство) → снапшот плитки. */
export function snapshotFromRow(row: TileRow): DeviceTileSnapshot {
  return {
    ts: Math.round(row.ts_ms),
    stage: row.stage,
    primaryC: row.primary_c,
    setpointC: row.setpoint_c,
    heatDutyPct: row.heat_duty_pct,
    faultMask: row.fault_mask ?? 0,
    appMode: row.app_mode,
    pausedFrom: row.paused_from,
  };
}
