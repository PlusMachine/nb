// =============================================================================
//  @nb/device-sim — server.ts
//  HTTP (node:http, без доп. зависимостей) + WebSocket (ws) обёртка над
//  SimDevice. Отдаёт валидные конверты протокола @nb/brewforge-protocol.
//
//  REST:
//    GET  /telemetry  → текущий снимок Telemetry
//    POST /cmd        → принять Command, вернуть Ack
//    PUT  /recipe?slot=N   → записать DeviceRecipe, вернуть { slot }
//    GET  /recipe?slot=N   → прочитать DeviceRecipe слота (readSlotSnapshot), 404 если пуст
//    GET  /recipes         → карта слотов [{ slot, name }] (listSlots)
//    GET  /config     → { …сеть/отладка, config: DeviceConfig }  (§6.3, несекретный)
//    PUT  /config     → патч DeviceConfig (клампится), вернуть эффективный { config }
//    POST /sim/fault  → dev/demo-only: инжект/сброс аварии { fault?, action: "raise"|"clear" }
//    GET  /log        → последние события брю-лога
//    GET  /events     → SSE-поток телеметрии (без зависимостей)
//    GET  /health     → { ok: true }
//  WS:
//    /ws              → поток телеметрии ~1 Гц + приём кадров-команд → Ack
// =============================================================================
import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { topics, FAULT_BITS, FAULT_NAMES, type Fault } from "@nb/brewforge-protocol";
import type { SimDevice } from "@nb/brewforge-sim";

export interface ServerHandle {
  http: http.Server;
  wss: WebSocketServer;
  close: () => Promise<void>;
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, JSON_HEADERS);
  res.end(data);
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return undefined;
  return JSON.parse(raw); // бросит SyntaxError при кривом JSON
}

export function startServer(device: SimDevice, port: number): ServerHandle {
  const httpServer = http.createServer((req, res) => {
    handleRequest(device, req, res).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) sendJson(res, 400, { error: msg });
      else res.end();
    });
  });

  // --- WebSocket: телеметрия наружу, команды внутрь ---
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    // сразу шлём текущий снимок
    safeSend(ws, { kind: "telemetry", data: device.snapshot() });

    const unsub = device.onTelemetry((t) => {
      safeSend(ws, { kind: "telemetry", data: t });
    });

    ws.on("message", (buf) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(buf.toString());
      } catch {
        safeSend(ws, { kind: "error", error: "невалидный JSON" });
        return;
      }
      // допускаем как { type:"cmd", cmd:{...} }, так и голую команду
      const cmd =
        parsed && typeof parsed === "object" && "cmd" in parsed
          ? (parsed as { cmd: unknown }).cmd
          : parsed;
      const ack = device.handleCommand(cmd);
      safeSend(ws, { kind: "ack", data: ack });
    });

    ws.on("close", () => unsub());
    ws.on("error", () => unsub());
  });

  httpServer.listen(port);

  return {
    http: httpServer,
    wss,
    close: () =>
      new Promise<void>((resolve) => {
        for (const client of wss.clients) client.terminate();
        wss.close(() => httpServer.close(() => resolve()));
      }),
  };
}

async function handleRequest(
  device: SimDevice,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const method = req.method ?? "GET";

  // --- GET /telemetry ---
  if (method === "GET" && path === "/telemetry") {
    sendJson(res, 200, device.snapshot());
    return;
  }

  // --- GET /config ---
  if (method === "GET" && path === "/config") {
    const cfg = device.config();
    sendJson(res, 200, { ...cfg, topics: topics(cfg.deviceId), config: device.readConfig() });
    return;
  }

  // --- PUT /config (патч §6.3: сливается + клампится, возвращает эффективный) ---
  if (method === "PUT" && path === "/config") {
    const body = await readBody(req);
    try {
      const effective = device.writeConfig(body);
      sendJson(res, 200, { config: effective });
    } catch (err) {
      sendJson(res, 422, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // --- GET /log ---
  if (method === "GET" && path === "/log") {
    sendJson(res, 200, { entries: device.getLog() });
    return;
  }

  // --- GET /health ---
  if (method === "GET" && path === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  // --- POST /cmd ---
  if (method === "POST" && path === "/cmd") {
    const body = await readBody(req);
    const ack = device.handleCommand(body);
    sendJson(res, ack.ok ? 200 : 422, ack);
    return;
  }

  // --- PUT /recipe?slot=N ---
  if (method === "PUT" && path === "/recipe") {
    const body = await readBody(req);
    const slotParam = url.searchParams.get("slot");
    const slot = slotParam === null ? 0 : Number.parseInt(slotParam, 10);
    if (Number.isNaN(slot)) {
      sendJson(res, 400, { error: "slot должен быть числом" });
      return;
    }
    try {
      const written = device.putRecipe(body, slot);
      sendJson(res, 200, { slot: written });
    } catch (err) {
      sendJson(res, 422, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // --- POST /sim/fault (dev/demo-only: инжект/сброс аварии) ---
  if (method === "POST" && path === "/sim/fault") {
    const body = await readBody(req);
    const action = isRecord(body) ? body.action : undefined;
    if (action === "clear") {
      device.clearFaults();
      sendJson(res, 200, { ok: true, faultMask: device.snapshot().faultMask });
      return;
    }
    const faultRaw = isRecord(body) ? body.fault : undefined;
    if (typeof faultRaw !== "string" || !(faultRaw in FAULT_BITS)) {
      sendJson(res, 400, { error: `fault должен быть одним из: ${FAULT_NAMES.join(", ")}` });
      return;
    }
    device.injectFault(faultRaw as Fault);
    sendJson(res, 200, { ok: true, faultMask: device.snapshot().faultMask });
    return;
  }

  // --- GET /recipes (карта слотов, listSlots) ---
  if (method === "GET" && path === "/recipes") {
    sendJson(res, 200, { slots: device.listSlots() });
    return;
  }

  // --- GET /recipe?slot=N (read-only снапшот слота, readSlotSnapshot) ---
  if (method === "GET" && path === "/recipe") {
    const slotParam = url.searchParams.get("slot");
    const slot = slotParam === null ? 0 : Number.parseInt(slotParam, 10);
    if (Number.isNaN(slot)) {
      sendJson(res, 400, { error: "slot должен быть числом" });
      return;
    }
    try {
      const recipe = device.readSlot(slot);
      if (!recipe) {
        sendJson(res, 404, { error: `слот ${slot} пуст` });
        return;
      }
      sendJson(res, 200, recipe);
    } catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // --- GET /events (SSE поток телеметрии) ---
  if (method === "GET" && path === "/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify(device.snapshot())}\n\n`);
    const unsub = device.onTelemetry((t) => {
      res.write(`data: ${JSON.stringify(t)}\n\n`);
    });
    req.on("close", () => unsub());
    return;
  }

  sendJson(res, 404, { error: `not found: ${method} ${path}` });
}

function safeSend(ws: WebSocket, obj: unknown): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}
