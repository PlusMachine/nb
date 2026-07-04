// =============================================================================
//  features/brew-controller/stage-timeline.ts
//  Чистое ядро StageTimeline (интерактивная полоса стадий, зоны A/B). Сворачивает
//  bf_stage_t в 5 макро-стадий полосы прогресса и вычисляет: какие пройдены,
//  какая идёт сейчас и с какой долей заполнения, плюс overlay-состояния вне
//  линейного прогресса (IDLE / отложенный старт / ПАУЗА / РУЧНОЙ / АВАРИЯ).
//
//  Веб-HMI §5/§7/§8 (пакет H0): прибор мультирежимный — карта макро-стадий
//  зависит от appMode прибора (deriveAppMode из device-mode.ts):
//   - brew    — Затор → Кипячение → Вирпул → Охлаждение → Готово (как было);
//   - distill — Разогрев → Головы → Тело → Хвосты → Готово (стадии 17–20 + DONE);
//   - ferment — недельный процесс, полосы стадий нет вообще (см.
//               stageTimelineFromTelemetry) — свой профиль-блок привезёт H3.
//  Варочное поведение и его тесты — БЕЗ изменений.
//
//  Без React/DOM-зависимостей — тестируется юнитами, переиспользуется компонентом.
//  Источник значений стадий — @nb/brewforge-protocol (STAGE_NUM), без магических
//  чисел: правка bf_stage_t в протоколе автоматически подхватывается здесь.
// =============================================================================
import { STAGE_NUM, type Stage, type Telemetry } from "@nb/brewforge-protocol";

import { deriveAppMode, type AppMode } from "./device-mode";

/** Режимы, у которых вообще есть линейная полоса стадий (ferment — нет, §8). */
export type StageTimelineMode = Extract<AppMode, "brew" | "distill">;

/** Макро-стадия полосы прогресса (укрупнение bf_stage_t), варка + дистилляция. */
export type MacroStage =
  | "mash"
  | "boil"
  | "hop_stand"
  | "cooling"
  | "done"
  | "distill_preheat"
  | "heads"
  | "hearts"
  | "tails"
  | "distill_done";

/** Линейный порядок макро-стадий варки (индекс = позиция на полосе). */
export const MACRO_STAGE_ORDER: MacroStage[] = ["mash", "boil", "hop_stand", "cooling", "done"];

/** Линейный порядок макро-стадий дистилляции (полоса фракций, §7). */
export const DISTILL_MACRO_STAGE_ORDER: MacroStage[] = [
  "distill_preheat",
  "heads",
  "hearts",
  "tails",
  "distill_done",
];

function macroStageOrderFor(mode: StageTimelineMode): MacroStage[] {
  return mode === "distill" ? DISTILL_MACRO_STAGE_ORDER : MACRO_STAGE_ORDER;
}

export const MACRO_STAGE_LABELS: Record<MacroStage, string> = {
  mash: "Затор",
  boil: "Кипячение",
  hop_stand: "Вирпул",
  cooling: "Охлаждение",
  done: "Готово",
  distill_preheat: "Разогрев",
  heads: "Головы",
  hearts: "Тело",
  tails: "Хвосты",
  distill_done: "Готово",
};

/** Стадии, которые входят в каждую макро-стадию (для интерактивной подсказки). */
export const MACRO_STAGE_MEMBERS: Record<MacroStage, string> = {
  mash: "Засыпь, паузы затора, мэшаут, промывка",
  boil: "Выход на кипение и кипячение",
  hop_stand: "Вирпул / хопстенд",
  cooling: "Охлаждение до температуры внесения дрожжей",
  done: "Варка завершена",
  distill_preheat: "Полная мощность до порога голов",
  heads: "Отбор голов",
  hearts: "Отбор тела",
  tails: "Отбор хвостов, авто-стоп у конечной температуры",
  distill_done: "Перегон завершён",
};

/** Overlay-состояние вне линейного прогресса варки. */
export type TimelineOverlay = "none" | "idle" | "delayed_start" | "paused" | "manual" | "fault";

export type TimelineSegmentState = "done" | "current" | "future";

export type TimelineSegment = {
  macro: MacroStage;
  label: string;
  state: TimelineSegmentState;
  /** Доля заполнения текущего сегмента 0..1 (только для state==="current"), либо null. */
  progress: number | null;
};

export type StageTimeline = {
  segments: TimelineSegment[];
  overlay: TimelineOverlay;
  /** Человекочитаемая подпись текущего состояния (для баннера/заголовка). */
  currentLabel: string;
  /** Подпись подшага текущей стадии (напр. «Пауза 2 из 3») либо null. */
  substepLabel: string | null;
};

/** Числовое значение bf_stage_t → макро-стадия варки. Стадии вне карты — overlay. */
const MACRO_BY_STAGE: Record<number, MacroStage> = {
  [STAGE_NUM.PROMPT_SPARGE]: "mash",
  [STAGE_NUM.DOUGH_IN]: "mash",
  [STAGE_NUM.PROMPT_ADD_MALT]: "mash",
  [STAGE_NUM.MASH_STEP]: "mash",
  [STAGE_NUM.MASH_OUT]: "mash",
  [STAGE_NUM.PROMPT_IODINE]: "mash",
  [STAGE_NUM.PROMPT_REMOVE_MALT]: "mash",
  [STAGE_NUM.BOIL_RAMP]: "boil",
  [STAGE_NUM.BOILING]: "boil",
  [STAGE_NUM.HOP_STAND]: "hop_stand",
  [STAGE_NUM.COOLING]: "cooling",
  [STAGE_NUM.DONE]: "done",
};

/** Числовое значение bf_stage_t → макро-стадия дистилляции (полоса фракций, §7). */
const DISTILL_MACRO_BY_STAGE: Record<number, MacroStage> = {
  [STAGE_NUM.DISTILL_PREHEAT]: "distill_preheat",
  [STAGE_NUM.DISTILL_HEADS]: "heads",
  [STAGE_NUM.DISTILL_HEARTS]: "hearts",
  [STAGE_NUM.DISTILL_TAILS]: "tails",
  [STAGE_NUM.DONE]: "distill_done",
};

function macroByStageFor(mode: StageTimelineMode): Record<number, MacroStage> {
  return mode === "distill" ? DISTILL_MACRO_BY_STAGE : MACRO_BY_STAGE;
}

/** Узкий вход из телеметрии — только поля, влияющие на полосу (легко тестировать). */
export type StageTimelineInput = {
  stage: number;
  pausedFrom: number;
  stageElapsedSec: number;
  stageRemainingSec: number;
  mashStepIndex: number;
  nMashSteps: number;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Доля по таймеру стадии: elapsed / (elapsed + remaining); null если оба нулевые. */
function timeFraction(elapsedSec: number, remainingSec: number): number | null {
  const total = Math.max(0, elapsedSec) + Math.max(0, remainingSec);
  if (total <= 0) return null;
  return clamp01(Math.max(0, elapsedSec) / total);
}

/**
 * Прогресс текущей макро-стадии 0..1. Для затора с несколькими паузами таймер
 * сбрасывается на каждой паузе, поэтому долю затора считаем по номеру паузы:
 * (индекс паузы + доля текущей паузы) / число пауз. Иначе — по таймеру стадии.
 */
function macroProgress(macro: MacroStage, input: StageTimelineInput): number | null {
  const timeFrac = timeFraction(input.stageElapsedSec, input.stageRemainingSec);
  if (macro === "mash" && input.stage === STAGE_NUM.MASH_STEP && input.nMashSteps > 0) {
    const stepFrac = timeFrac ?? 0;
    const idx = Math.max(0, Math.min(input.mashStepIndex, input.nMashSteps - 1));
    return clamp01((idx + stepFrac) / input.nMashSteps);
  }
  // Финальная стадия (варки или перегона) всегда полностью залита.
  if (macro === "done" || macro === "distill_done") return 1;
  // Распределительные стадии дистилляции (разогрев/головы/тело/хвосты) прогрессируют
  // по таймеру стадии — так же, как boil/hop_stand/cooling у варки.
  return timeFrac;
}

function substepLabel(input: StageTimelineInput): string | null {
  if (input.stage === STAGE_NUM.MASH_STEP && input.nMashSteps > 0) {
    const shown = Math.max(1, Math.min(input.mashStepIndex + 1, input.nMashSteps));
    return `Пауза ${shown} из ${input.nMashSteps}`;
  }
  return null;
}

/**
 * Собрать модель полосы стадий из среза телеметрии. Возвращает 5 сегментов
 * (done/current/future) + overlay-состояние и подписи. Чистая функция.
 *
 * `mode` выбирает карту макро-стадий (§5/§7): по умолчанию "brew" (старые
 * колл-сайты и тесты не меняются), "distill" — полоса фракций. Для "ferment"
 * полосы стадий нет вообще — сюда её не зовут, см. stageTimelineFromTelemetry.
 */
export function computeStageTimeline(input: StageTimelineInput, mode: StageTimelineMode = "brew"): StageTimeline {
  const { stage, pausedFrom } = input;
  const macroByStage = macroByStageFor(mode);
  const macroStageOrder = macroStageOrderFor(mode);

  // Overlay-состояния вне линейного прогресса. PAUSED/FAULT позиционируем по
  // pausedFrom (куда вернётся FSM), чтобы полоса не «сбрасывалась» на паузе/аварии.
  let overlay: TimelineOverlay = "none";
  let currentMacro: MacroStage | null = macroByStage[stage] ?? null;
  let currentLabel = macroByStage[stage] ? MACRO_STAGE_LABELS[macroByStage[stage]] : "";

  if (stage === STAGE_NUM.IDLE) {
    overlay = "idle";
    currentMacro = null;
    currentLabel = "Ожидание";
  } else if (stage === STAGE_NUM.DELAYED_START) {
    overlay = "delayed_start";
    currentMacro = null;
    currentLabel = "Отложенный старт";
  } else if (stage === STAGE_NUM.MANUAL) {
    overlay = "manual";
    currentMacro = null;
    currentLabel = "Ручной режим";
  } else if (stage === STAGE_NUM.PAUSED) {
    overlay = "paused";
    currentMacro = macroByStage[pausedFrom] ?? null;
    currentLabel = "Пауза";
  } else if (stage === STAGE_NUM.FAULT) {
    overlay = "fault";
    currentMacro = macroByStage[pausedFrom] ?? null;
    currentLabel = "Авария";
  }

  const currentIndex = currentMacro ? macroStageOrder.indexOf(currentMacro) : -1;

  const segments: TimelineSegment[] = macroStageOrder.map((macro, index) => {
    let state: TimelineSegmentState = "future";
    if (currentIndex >= 0) {
      if (index < currentIndex) state = "done";
      else if (index === currentIndex) state = "current";
    }
    return {
      macro,
      label: MACRO_STAGE_LABELS[macro],
      state,
      // Прогресс считаем только для «настоящей» текущей стадии (не на паузе/аварии —
      // там таймер стадии не про текущую макро-стадию).
      progress:
        state === "current" && overlay === "none" ? macroProgress(macro, input) : state === "current" ? 0 : null,
    };
  });

  return {
    segments,
    overlay,
    currentLabel,
    substepLabel: overlay === "none" ? substepLabel(input) : null,
  };
}

/**
 * Обёртка: модель полосы из полной телеметрии (или пустой прогресс, если нет
 * кадра). Режим карты — из deriveAppMode: FERMENT — недельный процесс без
 * линейной полосы стадий (§8, свой профиль-блок привезёт H3) — null.
 */
export function stageTimelineFromTelemetry(telemetry: Telemetry | null): StageTimeline | null {
  if (!telemetry) return null;
  const appMode = deriveAppMode(telemetry) ?? "brew";
  if (appMode === "ferment") return null;
  return computeStageTimeline(
    {
      stage: telemetry.stage,
      pausedFrom: telemetry.pausedFrom,
      stageElapsedSec: telemetry.stageElapsedSec,
      stageRemainingSec: telemetry.stageRemainingSec,
      mashStepIndex: telemetry.mashStepIndex,
      nMashSteps: telemetry.nMashSteps,
    },
    appMode,
  );
}

/** Текущая макро-стадия из телеметрии (для подписи вне компонента), либо null. */
export function currentStageName(telemetry: Telemetry | null): Stage | null {
  return telemetry ? telemetry.stageName : null;
}
