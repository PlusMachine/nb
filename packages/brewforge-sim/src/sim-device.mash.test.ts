// =============================================================================
//  @nb/brewforge-sim — sim-device.mash.test.ts
//  Фикс Ф12: демо-нянька (ensureDemoBrewing) больше НЕ дёргает applyScenario("mash")
//  на каждом опросе телеметрии — старый вариант жёстко перезагружал варку из
//  встроенного слота 0 при любом waitingAck/DONE, отбрасывая реально идущий план
//  (в т.ч. рецепт пользователя, запушенный через startBrewOnDevice). Отсюда два
//  симптома: зацикленный mash (пила на графике, откат stepIdx) и подмена рецепта
//  пользователя встроенным демо-рецептом.
//
//  Новая нянька подтверждает промпт положительным ответом и продолжает ТЕКУЩИЙ
//  активный план (advanceStep, без рестарта), а на DONE зацикливает ТОТ ЖЕ
//  рецепт, что реально шёл (this.activeRecipe), а не встроенный слот 0.
//
//  Таймстемпы demoPromptSeenAt/demoDoneSeenAt — от Date.now() (тот же источник,
//  что advanceToNow() использует по умолчанию), поэтому в тесте синхронизируем
//  фейковые системные часы (vi.setSystemTime) с синтетическим тикером, чтобы
//  DEMO_PROMPT_AUTOCONFIRM_MS/DEMO_DONE_RESTART_MS срабатывали детерминированно,
//  без реального ожидания секунд (паритет с sim-device.ferment.test.ts/
//  sim-device.distill.test.ts по стилю тикера, но здесь часы фейковые).
// =============================================================================
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cmdStartBrew, PROTOCOL_SCHEMA_VERSION, type DeviceRecipe } from "@nb/brewforge-protocol";

import { SimDevice } from "./sim-device";

/**
 * Детерминированный «тикер», синхронизирующий синтетический sim-clock
 * (advanceToNow(nowMs)) с фейковыми системными часами (Date.now(), которым
 * пользуется ensureDemoBrewing напрямую) — иначе демо-нянька мерила бы свои
 * DEMO_PROMPT_AUTOCONFIRM_MS/DEMO_DONE_RESTART_MS ПРОТИВ РЕАЛЬНОГО времени теста.
 */
function makeTicker(device: SimDevice, tickMs: number): () => void {
  let t = Date.now();
  return () => {
    t += tickMs;
    vi.setSystemTime(t);
    device.advanceToNow(t);
  };
}

type Frame = {
  stageName: string;
  mashStepIndex: number;
  nMashSteps: number;
  recipeName: string;
  statusLine: string;
};

function frameOf(device: SimDevice): Frame {
  const snap = device.snapshot();
  return {
    stageName: snap.stageName,
    mashStepIndex: snap.mashStepIndex,
    nMashSteps: snap.nMashSteps,
    recipeName: snap.recipeName,
    statusLine: snap.statusLine,
  };
}

/** Прогнать N вызовов ensureDemoBrewing()+snapshot() после тика, собрав кадры. */
function driveDemo(device: SimDevice, tick: () => void, ticks: number): Frame[] {
  const frames: Frame[] = [];
  for (let i = 0; i < ticks; i++) {
    tick();
    device.ensureDemoBrewing();
    frames.push(frameOf(device));
  }
  return frames;
}

/**
 * Прогнать до первого появления стадии stageName (включительно), с защитой
 * от бесконечного цикла (maxTicks). Не переступает через искомую стадию —
 * важно там, где дальше идёт демо-рестарт (DONE), который тест проверяет отдельно.
 */
function driveUntil(device: SimDevice, tick: () => void, stageName: string, maxTicks: number): Frame[] {
  const frames: Frame[] = [];
  for (let i = 0; i < maxTicks; i++) {
    tick();
    device.ensureDemoBrewing();
    const frame = frameOf(device);
    frames.push(frame);
    if (frame.stageName === stageName) return frames;
  }
  throw new Error(`Стадия ${stageName} не достигнута за ${maxTicks} тиков`);
}

describe("SimDevice — демо-нянька ensureDemoBrewing (сценарий mash, Ф12)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("сценарий mash по умолчанию: доходит до BOILING/DONE, mashStepIndex не откатывается назад до легитимного DONE-рестарта, статус без дев-жаргона", () => {
    const tickMs = 250;
    const device = new SimDevice({
      deviceId: "mash-default",
      fw: "sim-test",
      tickMs,
      tickScale: 600, // 1 реальная сек = 600 «варочных» сек — вся варка за секунды теста
      scenario: "mash",
    });
    const tick = makeTicker(device, tickMs);

    // Прогоняем ровно до первого DONE (не переступая через него — дальше идёт
    // отдельная проверка DONE-рестарта по своим порогам времени).
    const frames = driveUntil(device, tick, "DONE", 300);

    // Дошли до кипения — не застряли/не зациклились на mash.
    expect(frames.some((f) => f.stageName === "BOILING")).toBe(true);

    // mashStepIndex во время MASH_STEP только растёт (0 → 1, Beta → Alpha),
    // никогда не откатывается назад к 0 ДО первого DONE — старый баг перезапускал
    // план на КАЖДОМ опросе, из-за чего индекс пилил туда-сюда.
    let prevMashIdx = -1;
    for (const f of frames) {
      if (f.stageName !== "MASH_STEP") continue;
      expect(f.mashStepIndex).toBeGreaterThanOrEqual(prevMashIdx);
      prevMashIdx = f.mashStepIndex;
    }
    expect(prevMashIdx).toBe(1); // побывали и на Alpha (индекс 1), не только на Beta

    // Честная метка шага (enterStep/step.status) — без буквального «сценарий mash».
    for (const f of frames) {
      expect(f.statusLine).not.toContain("сценарий mash");
    }

    // Сразу после DONE — держим стадию, НЕ телепортируем рестарт раньше срока
    // (DEMO_DONE_RESTART_MS≈8000мс = 32 тика по 250мс): следующие тики короче
    // порога обязаны оставаться в DONE.
    const staysDoneFrames = driveDemo(device, tick, 20); // 20×250мс=5000мс < 8000мс
    for (const f of staysDoneFrames) {
      expect(f.stageName).toBe("DONE");
    }

    // Досчитываем порог и чуть сверх — DONE-рестарт обязан случиться, зацикливая
    // ТОТ ЖЕ (встроенный) рецепт, что реально шёл, а не какой-то другой.
    const restartFrames = driveDemo(device, tick, 20); // ещё 5000мс — суммарно 10000мс с первого DONE
    expect(restartFrames.some((f) => f.stageName !== "DONE")).toBe(true);
    // Рецепт после рестарта — тот же встроенный демо-рецепт (2 шага затирания),
    // а не какой-то посторонний.
    const afterRestart = restartFrames.find((f) => f.stageName !== "DONE")!;
    expect(afterRestart.recipeName).toBe("Demo Pale Ale");
    expect(afterRestart.nMashSteps).toBe(2);
  });

  it("putRecipe кастомный 1-шаговый рецепт + START_BREW: телеметрия остаётся от кастомного рецепта при многократном авто-подтверждении промптов, встроенный слот 0 не подмешивается", () => {
    const tickMs = 250;
    const device = new SimDevice({
      deviceId: "mash-custom-recipe",
      fw: "sim-test",
      tickMs,
      tickScale: 600,
      scenario: "idle", // без встроенного демо-сценария — рецепт заводим сами, как startBrewOnDevice
    });
    const tick = makeTicker(device, tickMs);

    const customRecipe: DeviceRecipe = {
      schema: PROTOCOL_SCHEMA_VERSION,
      name: "Рецепт пользователя",
      units: "C",
      mash: {
        doughInTempC: null,
        pidDuringDoughIn: true,
        steps: [{ name: "Единственная", tempC: 66, timeMin: 20 }],
        mashOut: null,
      },
      boil: { boilTimeMin: 10, boilTempC: null, hops: [] },
      hopStand: [],
      whirlpool: "hot",
      cooling: { targetC: 20 },
    };
    const slot = device.putRecipe(customRecipe); // автовыбор первого свободного записываемого слота (6)
    expect(slot).toBe(6);
    const ack = device.handleCommand(cmdStartBrew(slot));
    expect(ack.ok).toBe(true);

    // Прогоняем через DOUGH_IN → PROMPT_ADD_MALT (авто-подтверждение) → MASH_STEP →
    // PROMPT_IODINE (авто-подтверждение) → BOIL_RAMP → BOILING → COOLING → DONE.
    const frames = driveDemo(device, tick, 300);

    expect(frames.some((f) => f.stageName === "MASH_STEP")).toBe(true);
    expect(frames.some((f) => f.stageName === "BOILING")).toBe(true);
    expect(frames.some((f) => f.stageName === "DONE")).toBe(true);

    // ВСЮ дорогу — кастомный рецепт пользователя, встроенный «Demo Pale Ale»
    // (слот 0) ни разу не подмешался, несмотря на несколько промптов по пути.
    const recipeNames = new Set(frames.map((f) => f.recipeName));
    expect([...recipeNames]).toEqual(["Рецепт пользователя"]);

    // nMashSteps — от кастомного рецепта (1 шаг), а не от встроенного (2 шага).
    const nMashSteps = new Set(frames.filter((f) => f.stageName !== "FERMENT").map((f) => f.nMashSteps));
    expect([...nMashSteps].every((n) => n <= 1)).toBe(true);
  });
});
