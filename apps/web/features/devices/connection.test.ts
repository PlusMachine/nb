import { describe, expect, it } from "vitest";

import { DEVICE_ONLINE_WITHIN_MS, summarizeDeviceConnection } from "./connection";

const now = Date.parse("2026-10-20T10:00:00Z");

describe("device connection summary", () => {
  it("requires a contact before showing an online badge", () => {
    expect(summarizeDeviceConnection({ status: "online", lastSeenAtMs: null }, now))
      .toMatchObject({ tone: "unknown", label: "Ожидает подключения" });
  });

  it("expires a stored online status at the shared presence threshold", () => {
    expect(summarizeDeviceConnection({
      status: "online", lastSeenAtMs: now - DEVICE_ONLINE_WITHIN_MS
    }, now).tone).toBe("online");
    expect(summarizeDeviceConnection({
      status: "online", lastSeenAtMs: now - DEVICE_ONLINE_WITHIN_MS - 1
    }, now)).toMatchObject({ tone: "offline", label: "Не в сети", lastContactLabel: "5 мин назад" });
  });

  it("accepts fresh telemetry when the heartbeat is older", () => {
    expect(summarizeDeviceConnection({
      status: "online", lastSeenAtMs: now - 600_000, lastTelemetryAtMs: now - 1000
    }, now)).toMatchObject({ tone: "online", lastContactLabel: "только что" });
  });

  it("does not overwrite a known disconnection with an old online reading", () => {
    expect(summarizeDeviceConnection({
      status: "offline", lastSeenAtMs: now - 1000, lastTelemetryAtMs: now - 2000
    }, now).tone).toBe("offline");
  });

  it("ignores invalid timestamps", () => {
    expect(summarizeDeviceConnection({
      status: "online", lastSeenAtMs: NaN, lastTelemetryAtMs: Infinity
    }, now).tone).toBe("unknown");
  });
});
