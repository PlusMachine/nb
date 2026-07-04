import { describe, expect, it } from "vitest";

import { pickLatestTelemetryPoint, resolveFermenterBindingStatus } from "./fermenter-status";
import type { TelemetryHistoryPoint } from "./contracts";

// =============================================================================
//  Юнит-тесты resolveFermenterBindingStatus/pickLatestTelemetryPoint — состояние
//  блока «Бродит в приборе» на акте «Брожение» (§8.4 docs/brewforge-web-hmi.md).
// =============================================================================

const point = (over: Partial<TelemetryHistoryPoint> = {}): TelemetryHistoryPoint => ({
  ts: 1_000,
  primaryC: 18.2,
  setpointC: 18,
  heatDutyPct: 0,
  stage: 21, // STAGE_NUM.FERMENT
  appMode: 2, // APP_MODE_NUM.ferment
  ...over
});

describe("pickLatestTelemetryPoint", () => {
  it("пустой массив → null", () => {
    expect(pickLatestTelemetryPoint([])).toBeNull();
  });

  it("выбирает точку с максимальным ts, а не последнюю по индексу", () => {
    const points = [point({ ts: 500 }), point({ ts: 2_000 }), point({ ts: 1_500 })];
    expect(pickLatestTelemetryPoint(points)?.ts).toBe(2_000);
  });
});

describe("resolveFermenterBindingStatus", () => {
  it("deviceId=null → unbound (партия не привязана, живёт руками)", () => {
    expect(resolveFermenterBindingStatus(null, [point()])).toEqual({ kind: "unbound" });
  });

  it("deviceId есть, истории нет → no-data (только что привязали / прибор молчит)", () => {
    expect(resolveFermenterBindingStatus("dev-1", [])).toEqual({ kind: "no-data", deviceId: "dev-1" });
  });

  it("deviceId есть, last-known appMode=ferment → fermenting", () => {
    const p = point();
    const status = resolveFermenterBindingStatus("dev-1", [p]);
    expect(status).toEqual({ kind: "fermenting", deviceId: "dev-1", point: p });
  });

  it("deviceId есть, last-known appMode=brew → mode-mismatch (граничный случай §8.4)", () => {
    const p = point({ appMode: 0, stage: 5 });
    const status = resolveFermenterBindingStatus("dev-1", [p]);
    expect(status).toEqual({ kind: "mode-mismatch", deviceId: "dev-1", point: p });
  });

  it("appMode отсутствует (старая прошивка), stage=FERMENT → fermenting (фолбэк по стадии)", () => {
    const p = point({ appMode: null, stage: 21 });
    const status = resolveFermenterBindingStatus("dev-1", [p]);
    expect(status.kind).toBe("fermenting");
  });

  it("берёт САМУЮ СВЕЖУЮ точку, даже если она не последняя в массиве", () => {
    const stale = point({ ts: 1_000, appMode: 2, stage: 21 });
    const fresh = point({ ts: 5_000, appMode: 0, stage: 5 });
    const status = resolveFermenterBindingStatus("dev-1", [fresh, stale]);
    expect(status.kind).toBe("mode-mismatch");
    if (status.kind === "mode-mismatch") {
      expect(status.point.ts).toBe(5_000);
    }
  });
});
