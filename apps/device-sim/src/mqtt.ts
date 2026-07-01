// =============================================================================
//  @nb/device-sim — mqtt.ts
//  MQTT-режим симулятора: говорит на тех же топиках, что прошивка (bf_mqtt.c) и
//  ждёт от него apps/bridge. Позволяет гонять облачный путь портала end-to-end
//  без железа: docker mosquitto + apps/bridge + sim --mqtt + cloud-устройство.
//
//  Топики (источник — @nb/brewforge-protocol/topics, deviceId = hardwareId):
//    pub  brewforge/<id>/telemetry  (QoS0)        ← каждый кадр device.onTelemetry
//    pub  brewforge/<id>/status     (QoS1,retain) ← "online"; LWT "offline"
//    sub  brewforge/<id>/cmd        (QoS1)         → device.handleCommand → ack
//    pub  brewforge/<id>/cmd/ack    (QoS1)
//    sub  brewforge/<id>/recipe     (QoS1)         → device.putRecipe(slot 6)
//    pub  brewforge/<id>/log        (QoS0)         ← recipe_saved (для cloud start-brew)
// =============================================================================
import mqtt, { type MqttClient } from "mqtt";
import { topics, type Telemetry } from "@nb/brewforge-protocol";
import type { SimDevice } from "@nb/brewforge-sim";

export interface SimMqttHandle {
  client: MqttClient;
  close: () => Promise<void>;
}

// Записываемый слот рецепта — как у прошивки (pick_recipe_slot предпочитает 6/7).
const CLOUD_RECIPE_SLOT = 6;

const nowSec = (): number => Math.floor(Date.now() / 1000);

export function startMqtt(device: SimDevice, deviceId: string, url: string): SimMqttHandle {
  const t = topics(deviceId);
  const client = mqtt.connect(url, {
    clientId: `bf-sim-${deviceId}`,
    clean: true,
    reconnectPeriod: 3000,
    resubscribe: true,
    will: { topic: t.status, payload: "offline", qos: 1, retain: true },
  });

  let unsub = (): void => {};

  client.on("connect", () => {
    console.log(`[sim-mqtt] подключено к ${url}; топики brewforge/${deviceId}/*`);
    client.publish(t.status, "online", { qos: 1, retain: true }); // перебить retained LWT
    client.subscribe([t.cmd, t.recipe], { qos: 1 }, (err) => {
      if (err) console.error("[sim-mqtt] ошибка подписки:", err.message);
    });
    // Публикуем телеметрию по каждому кадру устройства (~1 Гц), как comms_task.
    unsub = device.onTelemetry((tele: Telemetry) => {
      client.publish(t.telemetry, JSON.stringify(tele), { qos: 0 }); // без retain (LOW-8)
    });
  });

  client.on("message", (topic, raw) => {
    let json: unknown;
    try {
      json = JSON.parse(raw.toString("utf8"));
    } catch {
      return; // битый кадр игнорируем
    }
    if (topic === t.cmd) {
      const ack = device.handleCommand(json);
      client.publish(t.ack, JSON.stringify(ack), { qos: 1 });
    } else if (topic === t.recipe) {
      try {
        const slot = device.putRecipe(json, CLOUD_RECIPE_SLOT);
        // Прошивка логирует «recipe saved slot N» в .../log; для облачного start-brew
        // даём типизированное событие — мост персистит его в brew_log_events, а портал
        // дочитывает слот для START_BREW(slot).
        client.publish(
          t.log,
          JSON.stringify({ ts: nowSec(), type: "recipe_saved", slot }),
          { qos: 0 },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        client.publish(
          t.log,
          JSON.stringify({ ts: nowSec(), type: "recipe_rejected", error: message }),
          { qos: 0 },
        );
      }
    }
  });

  client.on("error", (err) => console.error("[sim-mqtt] ошибка:", err.message));
  client.on("reconnect", () => console.warn("[sim-mqtt] переподключение…"));

  return {
    client,
    close: () =>
      new Promise<void>((resolve) => {
        unsub();
        client.publish(t.status, "offline", { qos: 1, retain: true });
        client.end(false, {}, () => resolve());
      }),
  };
}
