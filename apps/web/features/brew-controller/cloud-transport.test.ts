import { beforeEach, describe, expect, it, vi } from "vitest";

import { PROTOCOL_SCHEMA_VERSION, type Telemetry } from "@nb/brewforge-protocol";

// =============================================================================
//  Юнит-тесты облачного транспорта. @nb/db и ./mqtt-client замоканы; реальной БД
//  и брокера нет. TelemetrySchema — настоящий (проверяем именно парсинг payload).
//  Общие ссылки поднимаем через vi.hoisted (vi.mock хойстится выше импортов).
// =============================================================================
const h = vi.hoisted(() => {
  const rowsRef: { rows: Array<Record<string, unknown>> } = { rows: [] };
  const ackRef: { value: unknown } = { value: null };
  const publishMock = vi.fn(async (_hardwareId: string, _command: unknown) => ackRef.value);
  const publishRecipeMock = vi.fn(async (_hardwareId: string, _recipe: unknown) => {});
  return { rowsRef, ackRef, publishMock, publishRecipeMock };
});

vi.mock("@nb/db", () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(h.rowsRef.rows),
  };
  return {
    db: chain,
    brewTelemetry: { payload: "payload", ts: "ts", deviceId: "deviceId", id: "id" },
    brewLogEvents: { payload: "payload", createdAt: "createdAt", deviceId: "deviceId", type: "type" },
    desc: (x: unknown) => x,
    eq: (a: unknown, b: unknown) => ({ a, b }),
    and: (...xs: unknown[]) => xs,
  };
});

vi.mock("./mqtt-client", () => ({
  publishCommandAwaitAck: h.publishMock,
  publishRecipe: h.publishRecipeMock,
  isCloudTransportEnabled: () => true,
}));

import { cloudTransport } from "./cloud-transport";

const DEVICE = { id: "11111111-1111-1111-1111-111111111111", hardwareId: "bf-e9f8" };

function telemetry(overrides: Partial<Telemetry> = {}): Telemetry {
  return {
    schema: PROTOCOL_SCHEMA_VERSION,
    deviceId: "bf-e9f8",
    fw: "sim-1",
    ts: 0,
    seq: 42,
    uptime: 10,
    stage: 5,
    stageName: "MASH_STEP",
    pausedFrom: 0,
    faultMask: 0,
    faults: [],
    heatingPermitted: true,
    sensors: [{ i: 0, c: 64.2, valid: true }],
    primary: { c: 64.2, valid: true },
    setpointC: 64,
    heatMode: 1,
    heatDutyPct: 30,
    heatOn: true,
    spargeHeatOn: false,
    pumpOn: true,
    boilPct: 0,
    stageRemainingSec: 600,
    stageElapsedSec: 120,
    mashStepIndex: 0,
    nMashSteps: 2,
    hopStandIndex: -1,
    prompt: 0,
    promptSeq: 0,
    nextHopAlert: false,
    activeRecipe: 6,
    recipeName: "Demo Pale Ale",
    statusLine: "Затирание",
    ...overrides,
  };
}

describe("cloudTransport.getTelemetry", () => {
  beforeEach(() => {
    h.rowsRef.rows = [];
  });

  it("парсит payload свежей строки brew_telemetry", async () => {
    h.rowsRef.rows = [{ payload: telemetry({ seq: 7 }), ts: new Date() }];
    const result = await cloudTransport(DEVICE).getTelemetry();
    expect(result).not.toBeNull();
    expect(result?.seq).toBe(7);
    expect(result?.stageName).toBe("MASH_STEP");
  });

  it("возвращает null, если строка устарела (офлайн)", async () => {
    h.rowsRef.rows = [{ payload: telemetry(), ts: new Date(Date.now() - 60_000) }];
    expect(await cloudTransport(DEVICE).getTelemetry()).toBeNull();
  });

  it("возвращает null при отсутствии строк", async () => {
    h.rowsRef.rows = [];
    expect(await cloudTransport(DEVICE).getTelemetry()).toBeNull();
  });

  it("возвращает null при невалидном payload (не роняет стрим)", async () => {
    h.rowsRef.rows = [{ payload: { not: "telemetry" }, ts: new Date() }];
    expect(await cloudTransport(DEVICE).getTelemetry()).toBeNull();
  });
});

describe("cloudTransport.sendCommand", () => {
  beforeEach(() => {
    h.ackRef.value = null;
    h.publishMock.mockClear();
  });

  it("публикует команду по hardwareId и возвращает ack устройства", async () => {
    const ack = { ackOf: "cmd-1", ok: true, reason: "OK", ts: 1 };
    h.ackRef.value = ack;
    const command = { id: "cmd-1", ts: 1, type: "PAUSE" } as never;

    const result = await cloudTransport(DEVICE).sendCommand(command);

    expect(result).toEqual(ack);
    expect(h.publishMock).toHaveBeenCalledWith(DEVICE.hardwareId, command);
  });

  it("пробрасывает honest nack (ok:false) от устройства", async () => {
    h.ackRef.value = { ackOf: "cmd-2", ok: false, reason: "REJECTED_INTERLOCK", ts: 1 };
    const result = await cloudTransport(DEVICE).sendCommand({ id: "cmd-2", ts: 1, type: "RESUME" } as never);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("REJECTED_INTERLOCK");
  });

  it("бросает CLOUD_NO_ACK, если устройство не подтвердило за таймаут", async () => {
    h.ackRef.value = null; // publishCommandAwaitAck → null
    await expect(
      cloudTransport(DEVICE).sendCommand({ id: "cmd-3", ts: 1, type: "STOP" } as never),
    ).rejects.toThrow(/CLOUD_NO_ACK/);
  });
});

describe("cloudTransport.putRecipe", () => {
  beforeEach(() => {
    h.rowsRef.rows = [];
    h.publishRecipeMock.mockClear();
  });

  it("публикует рецепт и дочитывает слот из recipe_saved (brew_log_events)", async () => {
    h.rowsRef.rows = [{ payload: { slot: 6 }, createdAt: new Date() }];
    const recipe = { schema: PROTOCOL_SCHEMA_VERSION, name: "X" } as never;

    const result = await cloudTransport(DEVICE).putRecipe(recipe);

    expect(result).toEqual({ slot: 6 });
    expect(h.publishRecipeMock).toHaveBeenCalledWith(DEVICE.hardwareId, recipe);
  });
});

describe("cloudTransport — операции, недоступные по облаку (ядро)", () => {
  it("getConfig/putConfig бросают CLOUD_UNSUPPORTED", async () => {
    const t = cloudTransport(DEVICE);
    await expect(t.getConfig()).rejects.toThrow(/CLOUD_UNSUPPORTED/);
    await expect(t.putConfig({} as never)).rejects.toThrow(/CLOUD_UNSUPPORTED/);
  });
});
