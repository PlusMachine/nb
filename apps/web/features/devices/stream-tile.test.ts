import { describe, expect, it } from "vitest";

import { streamSnapshotFromRow, type StreamTileRow } from "./stream-tile";

const baseRow: StreamTileRow = {
  device_id: "d1",
  ts_ms: 1_700_000_000_000,
  gravity_sg: 1.048,
  temp_c: 19.3,
  battery_v: 4.1,
  battery_pct: null,
  rssi: -76,
  interval_seconds: 900
};

describe("streamSnapshotFromRow", () => {
  it("переносит поля точки в снапшот плитки", () => {
    const snapshot = streamSnapshotFromRow(baseRow, "ispindel");
    expect(snapshot.hardwareKind).toBe("ispindel");
    expect(snapshot.gravitySg).toBe(1.048);
    expect(snapshot.tempC).toBe(19.3);
    expect(snapshot.batteryV).toBe(4.1);
    expect(snapshot.batteryPct).toBeNull();
    expect(snapshot.rssi).toBe(-76);
    expect(snapshot.lastReadingAtMs).toBe(1_700_000_000_000);
  });

  it("округляет дробный ts_ms (сырой SQL double precision)", () => {
    const snapshot = streamSnapshotFromRow({ ...baseRow, ts_ms: 1_700_000_000_499.7 }, "tilt");
    expect(snapshot.lastReadingAtMs).toBe(1_700_000_000_500);
  });

  it("порог «молчит» — 3× заявленный интервал точки (900 с → 2 700 000 мс)", () => {
    const snapshot = streamSnapshotFromRow(baseRow, "ispindel");
    expect(snapshot.staleThresholdMs).toBe(2_700_000);
  });

  it("без интервала в точке — откат на дефолтный порог ядра (3ч)", () => {
    const snapshot = streamSnapshotFromRow({ ...baseRow, interval_seconds: null }, "other");
    expect(snapshot.staleThresholdMs).toBe(3 * 3600 * 1000);
  });

  it("hardwareKind может быть null (устройство без указанного вида)", () => {
    const snapshot = streamSnapshotFromRow(baseRow, null);
    expect(snapshot.hardwareKind).toBeNull();
  });
});
