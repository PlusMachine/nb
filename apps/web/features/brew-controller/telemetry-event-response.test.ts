import { beforeEach, expect, it, vi } from "vitest";
import type { TelemetryFrame } from "./device-telemetry-cache";

const mocks = vi.hoisted(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn() }));
vi.mock("./device-telemetry-cache", () => ({ subscribeDeviceTelemetry: mocks.subscribe }));

import { telemetryEventResponse } from "./telemetry-event-response";

const device = { userId: "owner", deviceId: "device" };
let emit: (frame: TelemetryFrame) => void;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.subscribe.mockImplementation((_device, listener) => {
    emit = listener;
    return mocks.unsubscribe;
  });
});

it("skips subscription for a request already aborted", async () => {
  const response = telemetryEventResponse(AbortSignal.abort(), device);
  expect(await response.text()).toBe("");
  expect(mocks.subscribe).not.toHaveBeenCalled();
});

it("unsubscribes exactly once when the reader cancels and the request aborts", async () => {
  const controller = new AbortController();
  const response = telemetryEventResponse(controller.signal, device);
  const reader = response.body!.getReader();
  await reader.cancel();
  controller.abort();
  expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
});

it("closes the reader on abort and bounds queued frames", async () => {
  const controller = new AbortController();
  const response = telemetryEventResponse(controller.signal, device);
  const reader = response.body!.getReader();
  expect(response.headers.get("cache-control")).toContain("no-store");
  emit({ type: "offline" });
  emit({ type: "error", error: "read failed" });
  const { value } = await reader.read();
  expect(new TextDecoder().decode(value)).toBe("event: offline\ndata: {}\n\n");
  controller.abort();
  expect((await reader.read()).done).toBe(true);
  expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
});
