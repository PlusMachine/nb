import { describe, expect, it, vi } from "vitest";

vi.mock("@nb/db", () => ({
  db: {}, brewBatches: {}, brewDevices: {}, deviceCommands: {}, deviceControlLeases: {}, brewTelemetry: {}, brewLogEvents: {},
  and: vi.fn(), eq: vi.fn(), desc: vi.fn(), inArray: vi.fn()
}));
vi.mock("@/lib/device-token-crypto", () => ({ decryptDeviceToken: vi.fn() }));

describe("direct provider module loading", () => {
  it("does not initialize the registry through a circular guard/cache import", async () => {
    const { brewforgeProvider } = await import("./brewforge-provider");
    const { getProvider } = await import("./index");
    expect(getProvider("brewforge")).toBe(brewforgeProvider);
    expect(brewforgeProvider.sendCommand).toBeTypeOf("function");
  });
});
