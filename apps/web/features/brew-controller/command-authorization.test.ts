import { beforeEach, describe, expect, it, vi } from "vitest";
import { cmdStartBrew, cmdStartDelayed, cmdManualHeat, cmdManualPwm, cmdStartAutotune, cmdStop, cmdEstop } from "@nb/brewforge-protocol";

const mocks = vi.hoisted(() => ({ lease: vi.fn(), fresh: vi.fn() }));
vi.mock("./control-lease", () => ({ holdsValidLease: mocks.lease }));
vi.mock("./device-telemetry-cache", () => ({ readFreshTelemetry: mocks.fresh }));
import { assertDeviceCommandAuthorized } from "./command-authorization";

const identity = { userId: "owner", deviceId: "device", providerId: "brewforge", sessionId: "tab-1" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.lease.mockResolvedValue(true);
  mocks.fresh.mockResolvedValue({ seq: 1 });
});

describe("server command authorization", () => {
  it.each([undefined, "", "x".repeat(129), 123, {}])("rejects missing or invalid control session", async sessionId => {
    await expect(assertDeviceCommandAuthorized({ ...identity, sessionId: sessionId as string, command: cmdStartBrew(6) })).rejects.toThrow("NO_CONTROL_LEASE");
    expect(mocks.lease).not.toHaveBeenCalled();
    expect(mocks.fresh).not.toHaveBeenCalled();
  });

  it("checks the exact device, owner and tab, not just the user", async () => {
    mocks.lease.mockResolvedValue(false);
    await expect(assertDeviceCommandAuthorized({ ...identity, command: cmdStartBrew(6) })).rejects.toThrow("NO_CONTROL_LEASE");
    expect(mocks.lease).toHaveBeenCalledWith("device", { userId: "owner", sessionId: "tab-1" });
    expect(mocks.fresh).not.toHaveBeenCalled();
  });

  it.each([cmdStartBrew(6), cmdStartDelayed(30), cmdManualHeat(true), cmdManualPwm(10), cmdStartAutotune()])("blocks $type without fresh telemetry", async command => {
    mocks.fresh.mockResolvedValue(null);
    await expect(assertDeviceCommandAuthorized({ ...identity, command })).rejects.toThrow("DEVICE_STALE");
  });

  it("rechecks the lease after telemetry I/O", async () => {
    mocks.lease.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(assertDeviceCommandAuthorized({ ...identity, command: cmdStartBrew(6) })).rejects.toThrow("NO_CONTROL_LEASE");
  });

  it("accepts a start with a valid lease and fresh device telemetry", async () => {
    await expect(assertDeviceCommandAuthorized({ ...identity, command: cmdStartBrew(6) })).resolves.toBeUndefined();
    expect(mocks.fresh).toHaveBeenCalledWith({ userId: "owner", deviceId: "device", providerId: "brewforge" });
  });

  it.each([cmdStop(), cmdEstop()])("keeps $type available without lease or fresh telemetry", async command => {
    mocks.lease.mockResolvedValue(false);
    mocks.fresh.mockResolvedValue(null);
    await expect(assertDeviceCommandAuthorized({ ...identity, sessionId: undefined, command })).resolves.toBeUndefined();
    expect(mocks.lease).not.toHaveBeenCalled();
    expect(mocks.fresh).not.toHaveBeenCalled();
  });
});
