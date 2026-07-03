// =============================================================================
//  features/brew-controller/sim-transport.ts
//  In-process стаб-транспорт прод-демо (Phase 4.5): реализует DeviceTransport
//  поверх reference-симулятора @nb/brewforge-sim (SimDevice) — тот же класс, что
//  гоняет apps/device-sim, БЕЗ железа и БЕЗ loopback-сети. Так «Демо-пивоварня»
//  работает и в production («попробуй до покупки»), а не только в dev (где демо
//  указывает на локальный device-sim по loopback).
//
//  Состояние симулятора живёт в модульном синглтоне (Map deviceId→SimDevice) в
//  пределах одного инстанса сервера — как и device-telemetry-cache. Симулятор
//  продвигается ЛЕНИВО (advanceToNow перед каждым обращением) — без фонового
//  setInterval: физика/FSM/dead-man догоняют реальное время на чтении телеметрии
//  и командах. Демо эфемерно (сброс при рестарте инстанса) — это ок для «пробника».
//
//  Никаких сетевых fetch/SSRF-гарда здесь нет: транспорт целиком локальный.
// =============================================================================
import { SimDevice } from "@nb/brewforge-sim";
import type {
  Ack,
  Command,
  DeviceConfig,
  DeviceConfigPatch,
  DeviceRecipe,
  Telemetry,
} from "@nb/brewforge-protocol";

import type { DeviceTransport, DeviceRecipeSlot } from "./transport";

// Один симулятор на deviceId, переживающий запросы (state варки/слотов/конфига).
const sims = new Map<string, SimDevice>();

/** Параметры демо-симулятора: ускоренное «варочное» время, старт в простое. */
function createSim(deviceId: string): SimDevice {
  // start() НЕ вызываем — фоновый таймер не нужен: продвигаем через advanceToNow.
  return new SimDevice({
    deviceId,
    fw: "sim-demo",
    tickMs: 250, // мелкий шаг → плавное ленивое продвижение
    tickScale: 60, // 1 реальная сек = 60 «варочных» сек (демо летит быстро)
    scenario: "idle",
  });
}

/** Получить/создать симулятор устройства и продвинуть его к текущему моменту. */
function advanced(deviceId: string): SimDevice {
  let sim = sims.get(deviceId);
  if (!sim) {
    sim = createSim(deviceId);
    sims.set(deviceId, sim);
  }
  sim.advanceToNow();
  return sim;
}

/**
 * DeviceTransport поверх in-process SimDevice. Сигнатуры и семантика зеркалят
 * lanTransport, чтобы провайдер (brewforge-provider) не отличал демо от железа:
 *  - getTelemetry: демо всегда «в сети» → снапшот (никогда не null);
 *  - readSlotSnapshot: вне диапазона/пусто → null (как 404 у LAN);
 *  - putRecipe/handleCommand/config — прямая делегация классу симулятора.
 */
export function simTransport(deviceId: string): DeviceTransport {
  return {
    async getTelemetry(): Promise<Telemetry | null> {
      return advanced(deviceId).snapshot();
    },

    async sendCommand(cmd: Command): Promise<Ack> {
      return advanced(deviceId).handleCommand(cmd);
    },

    async putRecipe(recipe: DeviceRecipe, slot?: number): Promise<{ slot: number }> {
      // БЕЗ явного slot — SimDevice сам автовыбирает первый свободный ЗАПИСЫВАЕМЫЙ
      // слот (паритет с pick_recipe_slot() прошивки, слоты 0..5 — ROM-«встроенные»,
      // писать в них нельзя даже дефолтом). Раньше здесь стоял `slot ?? 0`, что на
      // демо тихо перезаписывало слот 0 при каждом «Старт варки» — расхождение с
      // реальным железом (сверка контракта, пакет 4-B).
      const written = advanced(deviceId).putRecipe(recipe, slot);
      return { slot: written };
    },

    async getConfig(): Promise<DeviceConfig | null> {
      return advanced(deviceId).readConfig();
    },

    async putConfig(cfg: DeviceConfigPatch): Promise<DeviceConfig> {
      return advanced(deviceId).writeConfig(cfg);
    },

    async listSlots(): Promise<DeviceRecipeSlot[]> {
      return advanced(deviceId).listSlots();
    },

    async readSlotSnapshot(slot: number): Promise<DeviceRecipe | null> {
      try {
        return advanced(deviceId).readSlot(slot);
      } catch {
        // вне диапазона слотов — трактуем как «нет снапшота» (паритет с LAN 404→null)
        return null;
      }
    },
  };
}
