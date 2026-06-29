// =============================================================================
//  features/brew-controller/mqtt-client.ts
//  Серверный синглтон MQTT-клиента портала — облачный путь команд BrewForge.
//
//  Зачем: облачное устройство недостижимо по LAN-REST с сервера nb (оно в домашней
//  сети пользователя). Команды доставляем через MQTT-брокер: публикуем в
//  brewforge/<hardwareId>/cmd (QoS1) и ждём ack с brewforge/<hardwareId>/cmd/ack,
//  коррелируя по cmd.id. Телеметрию облака читает cloud-transport из brew_telemetry
//  (её пишет apps/bridge), а НЕ этот клиент — здесь только исходящие команды + ack.
//
//  Синглтон висит на globalThis: переживает HMR в dev (Next перезагружает модули) и
//  не плодит лишние соединения. Один долгоживущий клиент на процесс портала
//  (монолит apps/web — единый runtime). Подписка одна: brewforge/+/cmd/ack —
//  входящие ack раздаём ожидающим по cmd.id (ackOf). Кросс-юзер безопасно: cmd.id —
//  неугадываемый uuid, чужой ack не матчит наш waiter.
//
//  Включается ТОЛЬКО при заданном BREWFORGE_MQTT_URL/MQTT_URL — иначе провайдер
//  выбирает LAN-транспорт, а этот модуль не подключается к брокеру.
// =============================================================================
import mqtt, { type MqttClient } from "mqtt";
import { AckSchema, type Ack, type Command, type DeviceRecipe } from "@nb/brewforge-protocol";

const ACK_WILDCARD = "brewforge/+/cmd/ack";
const DEFAULT_ACK_TIMEOUT_MS = 6000;

/** URL брокера портала. Пусто → облачный транспорт выключен (используем LAN). */
function brokerUrl(): string | null {
  const url = process.env.BREWFORGE_MQTT_URL ?? process.env.MQTT_URL;
  return url && url.length > 0 ? url : null;
}

/** Включён ли облачный путь (есть ли брокер у портала). */
export function isCloudTransportEnabled(): boolean {
  return brokerUrl() !== null;
}

type AckWaiter = (ack: Ack) => void;

type BrewforgeMqttState = {
  clientPromise: Promise<MqttClient> | null;
  /** commandId(ackOf) → резолвер ожидающего ack. */
  waiters: Map<string, AckWaiter>;
};

// Единое состояние на процесс. На globalThis — чтобы HMR не создавал второй клиент.
const GLOBAL_KEY = "__nbBrewforgeMqtt__";
const globalRef = globalThis as unknown as { [GLOBAL_KEY]?: BrewforgeMqttState };
const state: BrewforgeMqttState = (globalRef[GLOBAL_KEY] ??= {
  clientPromise: null,
  waiters: new Map<string, AckWaiter>(),
});

/** Разобрать входящий ack и разбудить ожидающего по ackOf (cmd.id). */
function dispatchAck(raw: Buffer): void {
  let json: unknown;
  try {
    json = JSON.parse(raw.toString("utf8"));
  } catch {
    return; // битый кадр — игнорируем
  }
  const parsed = AckSchema.safeParse(json);
  if (!parsed.success) return;
  const waiter = state.waiters.get(parsed.data.ackOf);
  if (waiter) waiter(parsed.data);
}

/** Лениво поднять (или переиспользовать) соединение с брокером. */
async function getClient(): Promise<MqttClient> {
  if (state.clientPromise) return state.clientPromise;
  const url = brokerUrl();
  if (!url) throw new Error("CLOUD_TRANSPORT_DISABLED");

  state.clientPromise = new Promise<MqttClient>((resolve, reject) => {
    let settled = false;
    const client = mqtt.connect(url, {
      clientId: `nb-portal-${Math.random().toString(16).slice(2, 10)}`,
      clean: true,
      reconnectPeriod: 3000,
      resubscribe: true,
      connectTimeout: 10_000,
      username: process.env.BREWFORGE_MQTT_USERNAME || undefined,
      password: process.env.BREWFORGE_MQTT_PASSWORD || undefined,
    });

    client.on("connect", () => {
      client.subscribe(ACK_WILDCARD, { qos: 1 }, (err) => {
        if (err) console.error("[brewforge-mqtt] подписка на ack не удалась:", err.message);
      });
      if (!settled) {
        settled = true;
        resolve(client);
      }
    });

    client.on("message", (_topic, raw) => dispatchAck(raw));

    client.on("error", (err) => {
      console.error("[brewforge-mqtt] ошибка:", err.message);
      // Ошибка до первого connect — сбрасываем промис, чтобы следующий вызов
      // мог переподключиться (не залипаем на мёртвом соединении).
      if (!settled) {
        settled = true;
        state.clientPromise = null;
        try {
          client.end(true);
        } catch {
          // already closing
        }
        reject(new Error("CLOUD_BROKER_UNREACHABLE"));
      }
    });
  });

  return state.clientPromise;
}

/**
 * Опубликовать команду на устройство (brewforge/<hardwareId>/cmd, QoS1) и дождаться
 * ack того же устройства (brewforge/<hardwareId>/cmd/ack), коррелируя по cmd.id.
 * Возвращает Ack либо null, если ack не пришёл за timeout (устройство офлайн / нет
 * связи с брокером у устройства). Гейтинг удалённого нагрева — на устройстве:
 * сюда вернётся честный nack (ok:false) с причиной, если оно отклонит команду.
 */
export async function publishCommandAwaitAck(
  hardwareId: string,
  command: Command,
  timeoutMs: number = DEFAULT_ACK_TIMEOUT_MS,
): Promise<Ack | null> {
  const client = await getClient();
  const topic = `brewforge/${hardwareId}/cmd`;

  let cleanup = (): void => {};
  const ackPromise = new Promise<Ack | null>((resolve) => {
    const timer = setTimeout(() => {
      state.waiters.delete(command.id);
      resolve(null);
    }, timeoutMs);
    cleanup = () => {
      clearTimeout(timer);
      state.waiters.delete(command.id);
    };
    state.waiters.set(command.id, (ack) => {
      cleanup();
      resolve(ack);
    });
  });

  try {
    await new Promise<void>((resolve, reject) => {
      client.publish(topic, JSON.stringify(command), { qos: 1 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } catch (error) {
    cleanup(); // публикация не удалась — снимаем waiter, не ждём впустую
    throw error;
  }

  return ackPromise;
}

/**
 * Опубликовать рецепт на устройство (brewforge/<hardwareId>/recipe, QoS1). Ответа
 * по проводу прошивка не шлёт (она логирует «recipe saved slot N» в .../log) —
 * номер слота вызывающий дочитывает из brew_log_events (cloud-transport.putRecipe).
 */
export async function publishRecipe(hardwareId: string, recipe: DeviceRecipe): Promise<void> {
  const client = await getClient();
  const topic = `brewforge/${hardwareId}/recipe`;
  await new Promise<void>((resolve, reject) => {
    client.publish(topic, JSON.stringify(recipe), { qos: 1 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
