import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Telemetry } from "@nb/brewforge-protocol";

const state = vi.hoisted(() => ({
  server: null as EventEmitter | null,
  select: vi.fn(),
  insert: vi.fn()
}));

vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    WebSocketServer: class extends EventEmitter {
      constructor() { super(); state.server = this; }
      close(callback: () => void) { callback(); }
    }
  };
});

vi.mock("../../bridge/src/db.js", () => ({
  db: { select: state.select, insert: state.insert },
  users: { id: "user-id" },
  sessions: {},
  brewDevices: {},
  and: (...values: unknown[]) => values,
  eq: (...values: unknown[]) => values,
  gt: (...values: unknown[]) => values
}));

import { startWsServer, type WsHub } from "../../bridge/src/ws";

class Socket extends EventEmitter {
  OPEN = 1;
  readyState = 1;
  send = vi.fn();
  close = vi.fn();
}

describe("bridge WS is a telemetry channel", () => {
  let hub: WsHub;
  let socket: Socket;

  beforeEach(async () => {
    vi.clearAllMocks();
    const query = {
      from: () => query,
      innerJoin: () => query,
      where: () => query,
      limit: async () => [{ userId: "owner", id: "owned-device" }]
    };
    state.select.mockReturnValue(query);
    hub = startWsServer({ port: 0 });
    socket = new Socket();
    state.server!.emit("connection", socket, { headers: { "sec-websocket-protocol": "nb-bridge-v1,session" } });
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: "ready" })));
    socket.send.mockClear();
  });

  afterEach(async () => { await hub.close(); });

  it.each(["START_BREW", "MANUAL_HEAT", "STOP"])("rejects %s without creating an audit row or dispatching a command", async (type) => {
    const readsBefore = state.select.mock.calls.length;
    socket.emit("message", Buffer.from(JSON.stringify({
      type: "command", deviceId: "device", command: { id: "command", type }
    })));
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: "error", error: "commands require HTTP API" })));
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.select).toHaveBeenCalledTimes(readsBefore);
    expect(hub).not.toHaveProperty("setCommandPublisher");
  });

  it("continues to deliver telemetry only while subscribed", async () => {
    socket.emit("message", Buffer.from(JSON.stringify({ type: "subscribe", deviceId: "device" })));
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: "subscribed", deviceId: "device" })));
    const frame = { seq: 1 } as Telemetry;
    hub.broadcastTelemetry("device", frame);
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: "telemetry", deviceId: "device", data: frame }));
    socket.emit("message", Buffer.from(JSON.stringify({ type: "unsubscribe", deviceId: "device" })));
    socket.send.mockClear();
    hub.broadcastTelemetry("device", frame);
    expect(socket.send).not.toHaveBeenCalled();
  });
});
