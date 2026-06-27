// =============================================================================
//  apps/bridge — mqtt.ts
//  Подключение к брокеру и приём топиков устройств. Источник истины топиков —
//  @nb/brewforge-protocol/topics. Подписки (wildcard `+` = deviceId/hardwareId):
//    brewforge/+/telemetry   → upsert статуса устройства + lean-строка brew_telemetry
//    brewforge/+/status      → brew_devices.status (online/offline)
//    brewforge/+/cmd/ack     → апдейт строки device_commands (acked/failed + reason)
//    brewforge/+/log         → insert brew_log_events
//
//  Девиз модуля — оборонительность: любой кривой payload отбрасывается, ни одно
//  сообщение не валит процесс (всё в try/catch, ошибки только логируются).
//  Аутентификация УСТРОЙСТВ — на брокере (per-device bearer); мост доверяет
//  топикам, прошедшим аутентификацию брокера.
// =============================================================================
import mqtt, { type MqttClient } from "mqtt";
import {
  AckSchema,
  TelemetrySchema,
  type Ack,
  type Command,
  type Telemetry,
} from "@nb/brewforge-protocol";

import {
  and,
  brewDevices,
  brewLogEvents,
  brewTelemetry,
  db,
  deviceCommands,
  eq,
  resolveActiveBatchId,
  resolveDeviceByHardwareId,
} from "./db.js";

const DEFAULT_MQTT_URL = "mqtt://localhost:1883";

/** Хуки наружу — мост раздаёт телеметрию/ack подписчикам WS (см. ws.ts). */
export interface MqttHooks {
  onTelemetry?: (hardwareId: string, telemetry: Telemetry) => void;
  onAck?: (hardwareId: string, ack: Ack) => void;
}

export interface MqttBridge {
  client: MqttClient;
  /** Опубликовать команду на устройство (brewforge/<id>/cmd, QoS1). */
  publishCommand: (hardwareId: string, command: Command) => Promise<void>;
  isConnected: () => boolean;
  close: () => Promise<void>;
}

// Топик → (deviceId, suffix). cmd/ack содержит слэш, поэтому suffix = всё после id.
function parseTopic(topic: string): { deviceId: string; suffix: string } | null {
  const parts = topic.split("/");
  if (parts.length < 3 || parts[0] !== "brewforge") return null;
  const deviceId = parts[1];
  const suffix = parts.slice(2).join("/");
  if (!deviceId) return null;
  return { deviceId, suffix };
}

// Секунды протокола → Date; защита от мусорного/нулевого ts.
function tsToDate(tsSec: number): Date {
  return tsSec > 0 ? new Date(tsSec * 1000) : new Date();
}

export function startMqtt(opts: { url?: string; hooks?: MqttHooks }): MqttBridge {
  const url = opts.url ?? DEFAULT_MQTT_URL;
  const hooks = opts.hooks ?? {};

  const client = mqtt.connect(url, {
    clientId: `nb-bridge-${Math.random().toString(16).slice(2, 10)}`,
    clean: true,
    reconnectPeriod: 3000,
    resubscribe: true,
  });

  const SUBSCRIPTIONS = [
    "brewforge/+/telemetry",
    "brewforge/+/status",
    "brewforge/+/cmd/ack",
    "brewforge/+/log",
  ];

  client.on("connect", () => {
    client.subscribe(SUBSCRIPTIONS, { qos: 1 }, (err) => {
      if (err) console.error("[mqtt] ошибка подписки:", err.message);
      else console.log(`[mqtt] подключено к ${url}, подписки: ${SUBSCRIPTIONS.join(", ")}`);
    });
  });

  client.on("reconnect", () => console.warn("[mqtt] переподключение…"));
  client.on("error", (err) => console.error("[mqtt] ошибка:", err.message));
  client.on("close", () => console.warn("[mqtt] соединение закрыто"));

  client.on("message", (topic, raw) => {
    // Никогда не даём обработчику уронить процесс.
    handleMessage(topic, raw, hooks).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[mqtt] сбой обработки ${topic}:`, msg);
    });
  });

  const publishCommand: MqttBridge["publishCommand"] = (hardwareId, command) =>
    new Promise<void>((resolve, reject) => {
      const topic = `brewforge/${hardwareId}/cmd`;
      client.publish(topic, JSON.stringify(command), { qos: 1 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

  const close = (): Promise<void> =>
    new Promise<void>((resolve) => client.end(false, {}, () => resolve()));

  return {
    client,
    publishCommand,
    isConnected: () => client.connected,
    close,
  };
}

async function handleMessage(topic: string, raw: Buffer, hooks: MqttHooks): Promise<void> {
  const parsed = parseTopic(topic);
  if (!parsed) return;
  const { deviceId, suffix } = parsed;

  // Пустой payload (например, очистка retained) — нечего обрабатывать.
  const text = raw.toString("utf8").trim();
  if (!text && suffix !== "status") return;

  let json: unknown = undefined;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      // status может прилетать голой строкой ("offline") — обработаем ниже.
      json = text;
    }
  }

  switch (suffix) {
    case "telemetry":
      return handleTelemetry(deviceId, json, hooks);
    case "status":
      return handleStatus(deviceId, json);
    case "cmd/ack":
      return handleAck(deviceId, json, hooks);
    case "log":
      return handleLog(deviceId, json);
    default:
      return;
  }
}

async function handleTelemetry(deviceId: string, json: unknown, hooks: MqttHooks): Promise<void> {
  const result = TelemetrySchema.safeParse(json);
  if (!result.success) {
    console.warn(`[mqtt] невалидная телеметрия ${deviceId}: ${result.error.issues[0]?.message}`);
    return;
  }
  const t = result.data;

  const device = await resolveDeviceByHardwareId(deviceId);
  if (!device) return; // непривязанное устройство — тихо игнорируем

  const now = new Date();

  // Upsert «живости» устройства: lastSeenAt/status/fw.
  await db
    .update(brewDevices)
    .set({ lastSeenAt: now, status: "online", fw: t.fw, updatedAt: now })
    .where(eq(brewDevices.id, device.id));

  const brewBatchId = await resolveActiveBatchId(device.id);

  // Lean-строка time-series: горячие поля распакованы, полный снимок — в payload.
  // Идемпотентно по (deviceId, brewBatchId, seq): дубли от конкурентных стримов/
  // моста тихо отбрасываются (тот же кадр не пишем дважды).
  await db.insert(brewTelemetry).values({
    deviceId: device.id,
    brewBatchId: brewBatchId ?? null,
    ts: tsToDate(t.ts),
    seq: t.seq,
    stage: t.stage,
    primaryC: t.primary.valid ? t.primary.c : null,
    setpointC: t.setpointC,
    heatDutyPct: t.heatDutyPct,
    payload: t as unknown as Record<string, unknown>,
  }).onConflictDoNothing({ target: [brewTelemetry.deviceId, brewTelemetry.brewBatchId, brewTelemetry.seq] });

  hooks.onTelemetry?.(deviceId, t);
}

async function handleStatus(deviceId: string, json: unknown): Promise<void> {
  // Принимаем как { status:"online"|"offline", fw?, ip? }, так и голую строку.
  let statusRaw: string | undefined;
  let fw: string | undefined;
  if (typeof json === "string") {
    statusRaw = json;
  } else if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    if (typeof obj.status === "string") statusRaw = obj.status;
    if (typeof obj.fw === "string") fw = obj.fw;
  }

  const normalized = statusRaw?.toLowerCase();
  const status: "online" | "offline" | "unknown" =
    normalized === "online" ? "online" : normalized === "offline" ? "offline" : "unknown";

  const device = await resolveDeviceByHardwareId(deviceId);
  if (!device) return;

  const now = new Date();
  await db
    .update(brewDevices)
    .set({
      status,
      updatedAt: now,
      ...(status === "online" ? { lastSeenAt: now } : {}),
      ...(fw ? { fw } : {}),
    })
    .where(eq(brewDevices.id, device.id));
}

async function handleAck(deviceId: string, json: unknown, hooks: MqttHooks): Promise<void> {
  const result = AckSchema.safeParse(json);
  if (!result.success) {
    console.warn(`[mqtt] невалидный ack ${deviceId}`);
    return;
  }
  const ack = result.data;

  // Скоупинг ack по устройству: устройство МОЖЕТ подтверждать только СВОИ команды.
  // Резолвим публикующее устройство по hardwareId из топика и обновляем строку
  // device_commands лишь если её device_id совпадает (иначе чужой ack игнорируется).
  const device = await resolveDeviceByHardwareId(deviceId);
  if (!device) return; // непривязанное устройство — тихо игнорируем

  await db
    .update(deviceCommands)
    .set({
      status: ack.ok ? "acked" : "failed",
      reason: ack.reason,
      ackedAt: new Date(),
    })
    .where(and(eq(deviceCommands.id, ack.ackOf), eq(deviceCommands.deviceId, device.id)));

  hooks.onAck?.(deviceId, ack);
}

async function handleLog(deviceId: string, json: unknown): Promise<void> {
  if (!json || typeof json !== "object") return;
  const obj = json as Record<string, unknown>;
  const type = typeof obj.type === "string" ? obj.type : null;
  if (!type) return; // лог без типа бессмыслен

  const device = await resolveDeviceByHardwareId(deviceId);
  if (!device) return;

  const tsSec = typeof obj.ts === "number" ? obj.ts : 0;
  const brewBatchId = await resolveActiveBatchId(device.id);

  await db.insert(brewLogEvents).values({
    deviceId: device.id,
    brewBatchId: brewBatchId ?? null,
    ts: tsToDate(tsSec),
    type,
    payload: obj,
  });
}
