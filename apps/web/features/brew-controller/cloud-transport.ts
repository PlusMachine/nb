// =============================================================================
//  features/brew-controller/cloud-transport.ts
//  Облачный транспорт «портал → устройство» (DeviceTransport) для устройств,
//  недостижимых по LAN с сервера nb. Параллель LAN-реализации в transport.ts;
//  провайдер выбирает реализацию в transportForDevice.
//
//  Телеметрия: читаем последний MQTT-кадр устройства, сохранённый apps/bridge
//  из brewforge/<id>/telemetry (~1 Гц). Если свежего кадра нет
//  (устройство офлайн) — возвращаем null, и SSE-роут отдаёт «offline».
//  Команды: ПУБЛИКУЕМ в брокер и коррелируем ack (mqtt-client).
//
//  putRecipe/getConfig/putConfig по облаку — отдельный шаг (cloud start-brew /
//  облачная синхронизация конфига). Пока бросаем CLOUD_UNSUPPORTED: эти операции
//  доступны по LAN, а облачный путь #1 — про ведение уже идущей варки откуда угодно.
// =============================================================================
import { and, brewDevices, brewLogEvents, db, desc, eq } from "@nb/db";
import {
  TelemetrySchema,
  type Ack,
  type Command,
  type DeviceConfig,
  type DeviceConfigPatch,
  type DeviceRecipe,
  type Telemetry,
} from "@nb/brewforge-protocol";

import type { DeviceTransport } from "./transport";
import { publishCommandAwaitAck, publishOta, publishRecipe } from "./mqtt-client";

// Кадр старше этого считаем «нет данных» (null): иначе дашборд показывал бы давнюю
// строку как живую (он детектит онлайн по факту прихода кадров, не по их seq).
const TELEMETRY_FRESH_MS = 8000;

function isFreshTimestamp(timestamp: number, now: number): boolean {
  const ageMs = now - timestamp;
  return ageMs >= -1000 && ageMs <= TELEMETRY_FRESH_MS;
}

// Сколько ждём подтверждения сохранения рецепта (событие recipe_saved в
// brew_log_events, которое пишет мост из .../log устройства) для облачного putRecipe.
const RECIPE_SLOT_TIMEOUT_MS = 6000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Устройство для облачного транспорта: db-id + заводской
 *  hardwareId (для топиков brewforge/<hardwareId>/*). */
export type CloudDeviceRef = { id: string; hardwareId: string };

export function cloudTransport(device: CloudDeviceRef): DeviceTransport {
  return {
    async getTelemetry(): Promise<Telemetry | null> {
      const [row] = await db
        .select({ payload: brewDevices.mqttTelemetry, receivedAt: brewDevices.mqttTelemetryAt, status: brewDevices.status })
        .from(brewDevices)
        .where(eq(brewDevices.id, device.id))
        .limit(1);
      const now = Date.now();
      if (row?.status !== "online" || !row.receivedAt || !isFreshTimestamp(row.receivedAt.getTime(), now)) return null;

      const parsed = TelemetrySchema.safeParse(row.payload);
      if (!parsed.success) return null;
      const frame = parsed.data;
      // При ts=0 устройство ещё не синхронизировало часы.
      return frame.ts === 0 || isFreshTimestamp(frame.ts * 1000, now) ? frame : null;
    },

    async sendCommand(command: Command): Promise<Ack> {
      const ack = await publishCommandAwaitAck(device.hardwareId, command);
      // null = опубликовали, но устройство не подтвердило за таймаут (офлайн/нет
      // связи с брокером). Бросаем — провайдер пометит аудит failed, роут отдаст
      // понятную причину. Контракт AckReason не расширяем синтетикой «таймаут».
      if (!ack) throw new Error("CLOUD_NO_ACK");
      return ack;
    },

    async putRecipe(recipe: DeviceRecipe, _slot?: number): Promise<{ slot: number }> {
      // Целевой слот по облаку не адресуется: прошивка сама выбирает записываемый
      // слот и рапортует его номер в .../log. `_slot` игнорируем — привязка nb
      // делается к ВЕРНУВШЕМУСЯ слоту (source of truth), а не к запрошенному.
      // Публикуем рецепт в брокер; прошивка сохраняет его в записываемый слот и
      // логирует «recipe_saved»+slot в .../log → мост пишет это в brew_log_events.
      // Дочитываем номер слота оттуда (нужен для последующего START_BREW(slot)).
      const since = Date.now();
      await publishRecipe(device.hardwareId, recipe);

      const deadline = since + RECIPE_SLOT_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const [row] = await db
          .select({ payload: brewLogEvents.payload, createdAt: brewLogEvents.createdAt })
          .from(brewLogEvents)
          .where(and(eq(brewLogEvents.deviceId, device.id), eq(brewLogEvents.type, "recipe_saved")))
          .orderBy(desc(brewLogEvents.createdAt))
          .limit(1);
        // Берём только событие ПОСЛЕ нашей публикации (с допуском на рассинхрон часов).
        if (row && new Date(row.createdAt).getTime() >= since - 2000) {
          const slot = typeof row.payload.slot === "number" ? row.payload.slot : 0;
          return { slot };
        }
        await sleep(400);
      }
      throw new Error("CLOUD_RECIPE_NO_SLOT");
    },

    async getConfig(): Promise<DeviceConfig | null> {
      throw new Error("CLOUD_UNSUPPORTED");
    },

    async putConfig(_config: DeviceConfigPatch): Promise<DeviceConfig> {
      throw new Error("CLOUD_UNSUPPORTED");
    },

    async listSlots() {
      throw new Error("CLOUD_UNSUPPORTED");
    },

    async readSlotSnapshot(_slot: number): Promise<DeviceRecipe | null> {
      throw new Error("CLOUD_UNSUPPORTED");
    },

    async startOta(url: string): Promise<void> {
      // Облачный запуск OTA (F3, §5.4): {"cmd":"ota","url"} в .../cmd. Ack по
      // проводу не коррелируется (форма без конверта Command) — прогресс/итог
      // прошивка рапортует в .../log, мост складывает в brew_log_events.
      await publishOta(device.hardwareId, url);
    },
  };
}
