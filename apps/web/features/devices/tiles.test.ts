import { describe, expect, it } from "vitest";

import {
  classifyTileFreshness,
  TILE_LIVE_WITHIN_MS,
  TILE_STALE_AFTER_MS,
} from "./contracts";
import { emptySnapshot, snapshotFromRow, type TileRow } from "./tile-snapshot";

describe("classifyTileFreshness", () => {
  it("свежий срез — live", () => {
    expect(classifyTileFreshness(0)).toBe("live");
    expect(classifyTileFreshness(TILE_LIVE_WITHIN_MS)).toBe("live");
  });

  it("недавний срез — recent", () => {
    expect(classifyTileFreshness(TILE_LIVE_WITHIN_MS + 1)).toBe("recent");
    expect(classifyTileFreshness(TILE_STALE_AFTER_MS)).toBe("recent");
  });

  it("старый срез — stale", () => {
    expect(classifyTileFreshness(TILE_STALE_AFTER_MS + 1)).toBe("stale");
    expect(classifyTileFreshness(10 * 60_000)).toBe("stale");
  });
});

// Маппинг строки оконного SQL-запроса → снапшот плитки (§14: appMode из payload).
describe("snapshotFromRow / emptySnapshot", () => {
  const baseRow: TileRow = {
    device_id: "d1",
    ts_ms: 1_700_000_000_000,
    stage: 19, // DISTILL_HEARTS
    primary_c: 82.4,
    setpoint_c: 83,
    heat_duty_pct: 40,
    fault_mask: 0,
    app_mode: 1, // BF_APP_MODE_DISTILL
    paused_from: null,
  };

  it("прокидывает appMode из строки в снапшот", () => {
    expect(snapshotFromRow(baseRow).appMode).toBe(1);
  });

  it("app_mode=null (старая прошивка) → appMode=null", () => {
    expect(snapshotFromRow({ ...baseRow, app_mode: null }).appMode).toBeNull();
  });

  it("пустая история устройства (emptySnapshot) → appMode=null", () => {
    expect(emptySnapshot().appMode).toBeNull();
  });

  // pausedFrom — для честного бейджа плитки на паузе/аварии (§4.2 ревью H0).
  it("прокидывает pausedFrom из строки в снапшот", () => {
    expect(snapshotFromRow({ ...baseRow, paused_from: 19 }).pausedFrom).toBe(19); // DISTILL_HEARTS
  });

  it("paused_from=null (не на паузе/аварии) → pausedFrom=null", () => {
    expect(snapshotFromRow(baseRow).pausedFrom).toBeNull();
  });

  it("пустая история устройства (emptySnapshot) → pausedFrom=null", () => {
    expect(emptySnapshot().pausedFrom).toBeNull();
  });
});
