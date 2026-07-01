import { describe, expect, it } from "vitest";

import { telemetryEndpoints } from "./telemetry-source";

describe("telemetryEndpoints", () => {
  it("строит batch-эндпоинты (зона A)", () => {
    const e = telemetryEndpoints({ kind: "batch", brewBatchId: "b1" });
    expect(e.stream).toBe("/api/brew-batches/b1/telemetry");
    expect(e.command).toBe("/api/brew-batches/b1/command");
    expect(e.history).toBe("/api/brew-batches/b1/telemetry/history");
    expect(e.lease).toBe("/api/brew-batches/b1/control-lease");
  });

  it("строит device-эндпоинты (зона B)", () => {
    const e = telemetryEndpoints({ kind: "device", deviceId: "d1" });
    expect(e.stream).toBe("/api/devices/d1/telemetry");
    expect(e.command).toBe("/api/devices/d1/command");
    expect(e.history).toBe("/api/devices/d1/telemetry/history");
    expect(e.lease).toBe("/api/devices/d1/control-lease");
  });

  it("экранирует id в пути", () => {
    const e = telemetryEndpoints({ kind: "device", deviceId: "a/b?c" });
    expect(e.stream).toBe("/api/devices/a%2Fb%3Fc/telemetry");
  });
});
