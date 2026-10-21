// =============================================================================
//  apps/bridge — ws.ts
//  WebSocket-сервер для браузера/портала. Это realtime-канал «портал ↔ мост»:
//  фан-аут телеметрии устройства его владельцу. Команды идут через HTTP API.
//
//  Модель аутентификации/владения:
//   - Клиент передаёт raw nb_session НЕ в URL, а в заголовке Sec-WebSocket-Protocol
//     (через аргумент `protocols` конструктора WebSocket в браузере): два
//     суб-протокола — ["nb-bridge-v1", "<raw nb_session>"]. Так токен не попадает
//     в access/proxy-логи и Referer (в отличие от ?token=). Мост выбирает к
//     эхо-ответу ТОЛЬКО "nb-bridge-v1" (никогда токен), хэширует токен sha256
//     (схема @nb/auth.hashToken) и ищет в sessions→users живую сессию → userId.
//     Нет/просрочена → 4401 close. Токен нигде не логируется.
//   - Подписка на устройство РАЗРЕШЕНА, только если brew_devices.userId
//     == userId сессии (ownership-check при подписке).
//   - WS не принимает команды: проверки lease и свежести телеметрии выполняет HTTP API.
//   - Аутентификация УСТРОЙСТВ — на брокере; мост доверяет топикам брокера.
//
//  Протокол сообщений (JSON):
//   client→bridge: { type:"subscribe",   deviceId }
//                  { type:"unsubscribe", deviceId }
//   bridge→client: { type:"telemetry",   deviceId, data:<Telemetry> }
//                  { type:"ack",         deviceId, data:<Ack> }
//                  { type:"subscribed"|"unsubscribed", deviceId }
//                  { type:"error",       error }
// =============================================================================
import crypto from "node:crypto";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  type Ack,
  type Telemetry,
} from "@nb/brewforge-protocol";

import {
  and,
  brewDevices,
  db,
  eq,
  gt,
  sessions,
  users,
} from "./db.js";

const DEFAULT_WS_PORT = 8090;

// Имя суб-протокола WS: единственный протокол, который мост ЭХОИТ клиенту в
// ответном Sec-WebSocket-Protocol. Токен (второй offered-протокол) НИКОГДА не
// эхоится обратно, чтобы не утёк в заголовки/логи ответа.
const WS_SUBPROTOCOL = "nb-bridge-v1";

// sha256-хэш токена (совпадает с @nb/auth.hashToken — sha256 hex).
const hashToken = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

interface ClientCtx {
  ws: WebSocket;
  userId: string;
  // hardwareId устройств, на которые клиент подписан (после ownership-check).
  subscriptions: Set<string>;
}

export interface WsHub {
  /** Раздать телеметрию устройства его подписчикам-владельцам. */
  broadcastTelemetry: (hardwareId: string, telemetry: Telemetry) => void;
  /** Раздать ack команды подписчикам устройства. */
  broadcastAck: (hardwareId: string, ack: Ack) => void;
  clientCount: () => number;
  close: () => Promise<void>;
}

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === ws.OPEN) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* сокет умирает — игнорируем */
    }
  }
}

// Выбор суб-протокола к эхо-ответу: только идентификатор, НИКОГДА токен.
function selectSubprotocol(protocols: Set<string>): string | false {
  return protocols.has(WS_SUBPROTOCOL) ? WS_SUBPROTOCOL : false;
}

// Извлечь raw nb_session из Sec-WebSocket-Protocol (offered-протокол, не равный
// идентификатору WS_SUBPROTOCOL). Токен НЕ берём из URL — он не должен попадать в логи.
function extractToken(req: IncomingMessage): string {
  const header = req.headers["sec-websocket-protocol"];
  if (!header) return "";
  const offered = (Array.isArray(header) ? header.join(",") : header)
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return offered.find((value) => value !== WS_SUBPROTOCOL) ?? "";
}

// Резолв сессии по сырому токену → userId (живая, непросроченная).
async function resolveUserIdFromToken(rawToken: string): Promise<string | null> {
  const tokenHash = hashToken(rawToken);
  const [row] = await db
    .select({ userId: users.id })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row?.userId ?? null;
}

// Устройство, которым владеет данный user (ownership-check). null → не владеет/нет.
async function resolveOwnedDevice(
  hardwareId: string,
  userId: string,
): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: brewDevices.id })
    .from(brewDevices)
    .where(and(eq(brewDevices.hardwareId, hardwareId), eq(brewDevices.userId, userId)))
    .limit(1);
  return row ?? null;
}

export function startWsServer(opts: { port?: number }): WsHub {
  const port = opts.port ?? DEFAULT_WS_PORT;
  const wss = new WebSocketServer({ port, handleProtocols: selectSubprotocol });
  const clients = new Set<ClientCtx>();

  wss.on("listening", () => console.log(`[ws] слушает порт ${port}`));
  wss.on("error", (err) => console.error("[ws] ошибка сервера:", err.message));

  wss.on("connection", (ws, req) => {
    // Аутентификация на этапе хендшейка: raw nb_session в Sec-WebSocket-Protocol
    // (НЕ в URL). Токен нигде не логируется.
    const token = extractToken(req);
    if (!token) {
      send(ws, { type: "error", error: "missing token" });
      ws.close(4401, "unauthorized");
      return;
    }

    resolveUserIdFromToken(token)
      .then((userId) => {
        if (!userId) {
          send(ws, { type: "error", error: "invalid session" });
          ws.close(4401, "unauthorized");
          return;
        }
        const ctx: ClientCtx = {
          ws,
          userId,
          subscriptions: new Set(),
        };
        clients.add(ctx);
        send(ws, { type: "ready" });

        ws.on("message", (buf: Buffer) => {
          handleClientMessage(ctx, buf).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[ws] сбой обработки сообщения:", msg);
            send(ws, { type: "error", error: "internal error" });
          });
        });

        ws.on("close", () => clients.delete(ctx));
        ws.on("error", () => clients.delete(ctx));
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[ws] ошибка аутентификации:", msg);
        ws.close(4401, "unauthorized");
      });
  });

  const broadcastTelemetry = (hardwareId: string, telemetry: Telemetry): void => {
    for (const ctx of clients) {
      if (ctx.subscriptions.has(hardwareId)) {
        send(ctx.ws, { type: "telemetry", deviceId: hardwareId, data: telemetry });
      }
    }
  };

  const broadcastAck = (hardwareId: string, ack: Ack): void => {
    for (const ctx of clients) {
      if (ctx.subscriptions.has(hardwareId)) {
        send(ctx.ws, { type: "ack", deviceId: hardwareId, data: ack });
      }
    }
  };

  const close = (): Promise<void> =>
    new Promise<void>((resolve) => {
      for (const ctx of clients) ctx.ws.close(1001, "shutdown");
      clients.clear();
      wss.close(() => resolve());
    });

  return {
    broadcastTelemetry,
    broadcastAck,
    clientCount: () => clients.size,
    close,
  };
}

async function handleClientMessage(
  ctx: ClientCtx,
  buf: Buffer,
): Promise<void> {
  let msg: unknown;
  try {
    msg = JSON.parse(buf.toString("utf8"));
  } catch {
    send(ctx.ws, { type: "error", error: "invalid json" });
    return;
  }
  if (!msg || typeof msg !== "object") {
    send(ctx.ws, { type: "error", error: "invalid message" });
    return;
  }
  const obj = msg as Record<string, unknown>;
  const type = obj.type;
  const deviceId = typeof obj.deviceId === "string" ? obj.deviceId : "";

  switch (type) {
    case "subscribe": {
      if (!deviceId) return void send(ctx.ws, { type: "error", error: "missing deviceId" });
      const owned = await resolveOwnedDevice(deviceId, ctx.userId);
      if (!owned) return void send(ctx.ws, { type: "error", error: "forbidden" });
      ctx.subscriptions.add(deviceId);
      send(ctx.ws, { type: "subscribed", deviceId });
      return;
    }
    case "unsubscribe": {
      ctx.subscriptions.delete(deviceId);
      send(ctx.ws, { type: "unsubscribed", deviceId });
      return;
    }
    case "command": {
      send(ctx.ws, { type: "error", error: "commands require HTTP API" });
      return;
    }
    default:
      send(ctx.ws, { type: "error", error: "unknown message type" });
  }
}
