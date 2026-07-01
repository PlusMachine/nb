// =============================================================================
//  features/brew-controller/cloud-transport.ts
//  Облачный транспорт «портал → устройство» (DeviceTransport) для устройств,
//  недостижимых по LAN с сервера nb. Параллель LAN-реализации в transport.ts;
//  провайдер выбирает реализацию в transportForDevice.
//
//  Телеметрия: ЧИТАЕМ последнюю строку brew_telemetry устройства — её пишет
//  apps/bridge из brewforge/<id>/telemetry (~1 Гц). Если свежей строки нет
//  (устройство офлайн) — возвращаем null, и SSE-роут отдаёт «offline».
//  Команды: ПУБЛИКУЕМ в брокер и коррелируем ack (mqtt-client).
//
//  putRecipe/getConfig/putConfig по облаку — отдельный шаг (cloud start-brew /
//  облачная синхронизация конфига). Пока бросаем CLOUD_UNSUPPORTED: эти операции
//  доступны по LAN, а облачный путь #1 — про ведение уже идущей варки откуда угодно.
// =============================================================================
import { and, brewLogEvents, brewTelemetry, db, desc, eq } from "@nb/db";
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
import { publishCommandAwaitAck, publishRecipe } from "./mqtt-client";

// Кадр старше этого считаем «нет данных» (null): иначе дашборд показывал бы давнюю
// строку как живую (он детектит онлайн по факту прихода кадров, не по их seq).
// Мост пишет ~1 Гц; 8 с — терпит джиттер/краткий реконнект, но быстро ловит офлайн.
// ts строки — стенные часы устройства (SNTP); при ts=0 мост ставит реальное now,
// поэтому свежесть осмысленна и для несинхронизированных приборов.
const TELEMETRY_FRESH_MS = 8000;

// Сколько ждём подтверждения сохранения рецепта (событие recipe_saved в
// brew_log_events, которое пишет мост из .../log устройства) для облачного putRecipe.
const RECIPE_SLOT_TIMEOUT_MS = 6000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Устройство для облачного транспорта: db-id (для brew_telemetry) + заводской
 *  hardwareId (для топиков brewforge/<hardwareId>/*). */
export type CloudDeviceRef = { id: string; hardwareId: string };

export function cloudTransport(device: CloudDeviceRef): DeviceTransport {
  return {
    async getTelemetry(): Promise<Telemetry | null> {
      // Последняя строка по порядку вставки (bigserial id монотонен) — надёжнее ts,
      // который зависит от часов устройства.
      const [row] = await db
        .select({ payload: brewTelemetry.payload, ts: brewTelemetry.ts })
        .from(brewTelemetry)
        .where(eq(brewTelemetry.deviceId, device.id))
        .orderBy(desc(brewTelemetry.id))
        .limit(1);
      if (!row) return null;

      const ageMs = Date.now() - new Date(row.ts).getTime();
      if (ageMs > TELEMETRY_FRESH_MS) return null; // устарело → «offline»

      const parsed = TelemetrySchema.safeParse(row.payload);
      return parsed.success ? parsed.data : null;
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
  };
}
