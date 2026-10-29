import { beforeEach, describe, expect, it, vi } from "vitest";
import { cmdStartBrew, cmdStartDelayed, cmdStop, type Ack, type Command } from "@nb/brewforge-protocol";

type Row = Record<string, unknown>;
type Condition = { column: string; value: unknown } | { all: Condition[] };
const state = vi.hoisted(() => ({
  rows: {} as Record<string, Row[]>,
  lease: vi.fn(), fresh: vi.fn(), user: vi.fn(), status: vi.fn(), cloud: vi.fn(),
  put: vi.fn<() => Promise<{ slot: number }>>(),
  send: vi.fn<(command: Command) => Promise<Ack>>()
}));
vi.mock("@nb/db", () => {
  const matches = (row: Row, condition: Condition): boolean => "all" in condition
    ? condition.all.every(item => matches(row, item)) : row[condition.column] === condition.value;
  const tables = Object.fromEntries(["brewDevices", "brewBatches", "deviceCommands"].map(name => [name,
    new Proxy({ __table: name }, { get: (_target, prop) => prop === "__table" ? name : String(prop) })
  ]));
  return {
    ...tables,
    and: (...all: Condition[]) => ({ all }),
    eq: (column: string, value: unknown) => ({ column, value }),
    db: {
      select: () => ({ from: (table: { __table: string }) => ({ where: (condition: Condition) => ({
        limit: async () => (state.rows[table.__table] ?? []).filter(row => matches(row, condition)).map(row => ({ ...row }))
      }) }) }),
      insert: (table: { __table: string }) => ({ values: (values: Row) => ({ returning: async () => {
        const row = { id: "audit", ...values };
        (state.rows[table.__table] ??= []).push(row);
        return [row];
      } }) }),
      update: (table: { __table: string }) => ({ set: (values: Row) => ({ where: async (condition: Condition) => {
        for (const row of state.rows[table.__table] ?? []) if (matches(row, condition)) Object.assign(row, values);
      } }) })
    }
  };
});
vi.mock("@/lib/auth", () => ({ requireUser: state.user }));
vi.mock("@/lib/device-token-crypto", () => ({ decryptDeviceToken: () => undefined }));
vi.mock("./control-lease", () => ({ holdsValidLease: state.lease }));
vi.mock("./device-telemetry-cache", () => ({ readFreshTelemetry: state.fresh }));
vi.mock("./mqtt-client", () => ({ isCloudTransportEnabled: state.cloud }));
vi.mock("./translator", () => ({ brewPlanV1ToDeviceRecipe: () => ({}) }));
vi.mock("./transport", () => ({ lanTransport: () => ({ putRecipe: state.put, sendCommand: state.send }) }));
vi.mock("./sim-transport", () => ({ simTransport: () => ({ putRecipe: state.put, sendCommand: state.send }) }));
vi.mock("./cloud-transport", () => ({ cloudTransport: () => ({ putRecipe: state.put, sendCommand: state.send }) }));
vi.mock("@/features/devices/service", () => ({ getDeviceById: async (userId: string, id: string) =>
  state.rows.brewDevices!.find(row => row.id === id && row.userId === userId) ?? null
}));
vi.mock("@/features/brew-batches/service", () => ({
  getBrewBatchById: async (userId: string, id: string) => state.rows.brewBatches!.find(row => row.id === id && row.userId === userId) ?? null,
  createBrewBatchFromRecipe: async () => ({ id: "batch" }), updateBrewBatchStatus: state.status
}));

// Guard, реестр, провайдер и все три Server Actions — реальные. Подменены только
// БД, состояние lease/телеметрии и граница транспорта: нагрев не отправляется.
import { brewforgeProvider } from "./brewforge-provider";
import { startBrewOnDevice, startBrewOnDeviceAction } from "./actions";
import { startBrewOnDeviceFromRecipeAction } from "./brew-recipe-flow";
import { POST as devicePost } from "@/app/api/devices/[id]/command/route";
import { POST as batchPost } from "@/app/api/brew-batches/[id]/command/route";

const input = { userId: "owner", deviceId: "device", brewBatchId: "batch", sessionId: "tab-1" };
beforeEach(() => {
  vi.resetAllMocks();
  state.rows = {
    brewDevices: [{ id: "device", userId: "owner", providerId: "brewforge", hardwareId: "bf-test", localUrl: "http://192.168.1.50", tokenEncrypted: null }],
    brewBatches: [{ id: "batch", userId: "owner", deviceId: "device", brewPlanSnapshot: {}, status: "planned" }],
    deviceCommands: []
  };
  state.user.mockResolvedValue({ id: "owner" });
  state.lease.mockResolvedValue(true);
  state.fresh.mockResolvedValue({ seq: 1 });
  state.cloud.mockReturnValue(false);
  state.put.mockResolvedValue({ slot: 6 });
  state.send.mockImplementation(async command => ({ ackOf: command.id, ok: true, reason: "OK", ts: 1 }));
});

describe("all start entry points", () => {
  it.each(["internal", "action", "recipe"])("%s rejects missing lease before any recipe upload", async path => {
    state.lease.mockResolvedValue(false);
    if (path === "internal") await expect(startBrewOnDevice(input)).rejects.toThrow("NO_CONTROL_LEASE");
    else if (path === "action") expect(await startBrewOnDeviceAction(input)).toMatchObject({ ok: false, heatingStarted: false });
    else expect(await startBrewOnDeviceFromRecipeAction({ recipeId: "recipe", deviceId: input.deviceId, sessionId: input.sessionId })).toMatchObject({ ok: false, heatingStarted: false });
    expect(state.put).not.toHaveBeenCalled();
    expect(state.send).not.toHaveBeenCalled();
    expect(state.status).not.toHaveBeenCalled();
  });

  it("cannot trust a caller-supplied userId", async () => {
    await expect(startBrewOnDevice({ ...input, userId: "other-user" })).rejects.toThrow("FORBIDDEN");
    expect(state.put).not.toHaveBeenCalled();
  });

  it("rejects an omitted tab identity even with a valid login", async () => {
    await expect(startBrewOnDevice({ ...input, sessionId: undefined } as never)).rejects.toThrow("NO_CONTROL_LEASE");
    expect(state.put).not.toHaveBeenCalled();
  });

  it("rejects stale telemetry before device changes", async () => {
    state.fresh.mockResolvedValue(null);
    await expect(startBrewOnDevice(input)).rejects.toThrow("DEVICE_STALE");
    expect(state.put).not.toHaveBeenCalled();
    expect(state.send).not.toHaveBeenCalled();
  });

  it("rechecks the lease after a slow recipe upload", async () => {
    state.put.mockImplementationOnce(async () => {
      state.lease.mockResolvedValue(false);
      return { slot: 6 };
    });
    await expect(startBrewOnDevice(input)).rejects.toThrow("NO_CONTROL_LEASE");
    expect(state.send).not.toHaveBeenCalled();
    expect(state.status).not.toHaveBeenCalled();
  });

  it("rechecks telemetry after uploading the recipe", async () => {
    state.put.mockImplementationOnce(async () => {
      state.fresh.mockResolvedValue(null);
      return { slot: 6 };
    });
    await expect(startBrewOnDevice(input)).rejects.toThrow("DEVICE_STALE");
    expect(state.send).not.toHaveBeenCalled();
  });

  it("does not fall back to recipe slot zero on an invalid upload result", async () => {
    state.put.mockResolvedValue({ slot: NaN });
    await expect(startBrewOnDevice(input)).rejects.toThrow("INVALID_RECIPE_SLOT");
    expect(state.send).not.toHaveBeenCalled();
  });

  it.each(["lan", "cloud", "demo"])("%s starts the confirmed slot with current lease and telemetry", async channel => {
    state.rows.brewDevices![0]!.providerId = channel === "demo" ? "brewforge-demo" : "brewforge";
    if (channel === "cloud") {
      state.rows.brewDevices![0]!.localUrl = null;
      state.cloud.mockReturnValue(true);
    }
    await expect(startBrewOnDevice(input)).resolves.toMatchObject({ ok: true, heatingStarted: true, slot: 6 });
    expect(state.send).toHaveBeenCalledWith(expect.objectContaining({ type: "START_BREW", arg: expect.objectContaining({ i: 6 }) }));
    expect(state.status).toHaveBeenCalledWith("owner", "batch", "brewing");
  });

  it.each(["action", "recipe"])("%s forwards the tab identity through a successful real start", async path => {
    const result = path === "action"
      ? await startBrewOnDeviceAction(input)
      : await startBrewOnDeviceFromRecipeAction({ recipeId: "recipe", deviceId: input.deviceId, sessionId: input.sessionId });
    expect(result).toMatchObject({ ok: true, heatingStarted: true });
    expect(state.send).toHaveBeenCalledTimes(1);
  });

  it("direct provider callers cannot bypass the lease", async () => {
    state.lease.mockResolvedValue(false);
    await expect(brewforgeProvider.sendCommand({ ...input, command: cmdStartBrew(6) })).rejects.toThrow("NO_CONTROL_LEASE");
    expect(state.send).not.toHaveBeenCalled();
  });

  it("direct provider callers cannot bypass freshness", async () => {
    state.fresh.mockResolvedValue(null);
    await expect(brewforgeProvider.sendCommand({ ...input, command: cmdStartBrew(6) })).rejects.toThrow("DEVICE_STALE");
    expect(state.send).not.toHaveBeenCalled();
  });

  it("a delayed start also requires fresh telemetry", async () => {
    state.fresh.mockResolvedValue(null);
    await expect(brewforgeProvider.sendCommand({ ...input, command: cmdStartDelayed(30) })).rejects.toThrow("DEVICE_STALE");
    expect(state.send).not.toHaveBeenCalled();
  });

  it("REMOTE_DISABLED keeps heating off and selects the confirmed recipe under the same lease", async () => {
    state.send.mockResolvedValueOnce({ ackOf: "start", ts: 1, ok: false, reason: "REMOTE_DISABLED" });
    await expect(startBrewOnDevice(input)).resolves.toMatchObject({ ok: true, heatingStarted: false, slot: 6, reason: "REMOTE_DISABLED" });
    expect(state.send.mock.calls.map(([command]) => command.type)).toEqual(["START_BREW", "SELECT_RECIPE"]);
  });

  it("STOP still works without lease and telemetry", async () => {
    state.lease.mockResolvedValue(false);
    state.fresh.mockResolvedValue(null);
    await expect(brewforgeProvider.sendCommand({ ...input, sessionId: undefined, command: cmdStop() })).resolves.toMatchObject({ ok: true });
    expect(state.send).toHaveBeenCalledWith(expect.objectContaining({ type: "STOP" }));
  });
});

describe.each([{ name: "device", post: devicePost, id: "device" }, { name: "batch", post: batchPost, id: "batch" }])("$name HTTP command", ({ post, id }) => {
  const request = (command = cmdStartBrew(6), sessionId: string | undefined = "tab-1") => new Request("https://example.test/api/command", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command, sessionId })
  });
  it.each(["NO_CONTROL_LEASE", "DEVICE_STALE"])("returns 409 for %s", async code => {
    if (code === "NO_CONTROL_LEASE") state.lease.mockResolvedValue(false);
    else state.fresh.mockResolvedValue(null);
    const response = await post(request(), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code });
    expect(state.send).not.toHaveBeenCalled();
  });
  it("passes the tab identity to the real provider and allows an authorized start", async () => {
    const response = await post(request(), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(state.lease).toHaveBeenCalledWith("device", { userId: "owner", sessionId: "tab-1" });
  });
  it("returns 409 if the lease is lost between the HTTP check and provider dispatch", async () => {
    state.lease.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValue(false);
    const response = await post(request(), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "NO_CONTROL_LEASE" });
    expect(state.send).not.toHaveBeenCalled();
  });
  it("allows STOP without lease or telemetry", async () => {
    state.lease.mockResolvedValue(false);
    state.fresh.mockResolvedValue(null);
    const response = await post(request(cmdStop(), ""), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    expect(state.send).toHaveBeenCalledWith(expect.objectContaining({ type: "STOP" }));
    expect(state.fresh).not.toHaveBeenCalled();
  });
});
