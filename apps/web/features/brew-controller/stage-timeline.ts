// =============================================================================
//  features/brew-controller/stage-timeline.ts
//  Чистое ядро StageTimeline (интерактивная полоса стадий, зоны A/B). Сворачивает
//  16 значений bf_stage_t в 5 макро-стадий «варочного дня» (Затор → Кипячение →
//  Вирпул → Охлаждение → Готово) и вычисляет: какие пройдены, какая идёт
//  сейчас и с какой долей заполнения, плюс overlay-состояния вне линейного
//  прогресса (IDLE / отложенный старт / ПАУЗА / РУЧНОЙ / АВАРИЯ).
//
//  Без React/DOM-зависимостей — тестируется юнитами, переиспользуется компонентом.
//  Источник значений стадий — @nb/brewforge-protocol (STAGE_NUM), без магических
//  чисел: правка bf_stage_t в протоколе автоматически подхватывается здесь.
// =============================================================================
import { STAGE_NUM, type Stage, type Telemetry } from "@nb/brewforge-protocol";

/** Макро-стадия варочного дня (укрупнение bf_stage_t для полосы прогресса). */
export type MacroStage = "mash" | "boil" | "hop_stand" | "cooling" | "done";

/** Линейный порядок макро-стадий (индекс = позиция на полосе). */
export const MACRO_STAGE_ORDER: MacroStage[] = ["mash", "boil", "hop_stand", "cooling", "done"];

export const MACRO_STAGE_LABELS: Record<MacroStage, string> = {
  mash: "Затор",
  boil: "Кипячение",
  hop_stand: "Вирпул",
  cooling: "Охлаждение",
  done: "Готово",
};

/** Стадии, которые входят в каждую макро-стадию (для интерактивной подсказки). */
export const MACRO_STAGE_MEMBERS: Record<MacroStage, string> = {
  mash: "Засыпь, паузы затора, мэшаут, промывка",
  boil: "Выход на кипение и кипячение",
  hop_stand: "Вирпул / хопстенд",
  cooling: "Охлаждение до температуры внесения дрожжей",
  done: "Варка завершена",
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

/** Числовое значение bf_stage_t → макро-стадия. Стадии вне карты — overlay. */
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
  if (macro === "done") return 1;
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
 */
export function computeStageTimeline(input: StageTimelineInput): StageTimeline {
  const { stage, pausedFrom } = input;

  // Overlay-состояния вне линейного прогресса. PAUSED/FAULT позиционируем по
  // pausedFrom (куда вернётся FSM), чтобы полоса не «сбрасывалась» на паузе/аварии.
  let overlay: TimelineOverlay = "none";
  let currentMacro: MacroStage | null = MACRO_BY_STAGE[stage] ?? null;
  let currentLabel = MACRO_BY_STAGE[stage] ? MACRO_STAGE_LABELS[MACRO_BY_STAGE[stage]] : "";

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
    currentMacro = MACRO_BY_STAGE[pausedFrom] ?? null;
    currentLabel = "Пауза";
  } else if (stage === STAGE_NUM.FAULT) {
    overlay = "fault";
    currentMacro = MACRO_BY_STAGE[pausedFrom] ?? null;
    currentLabel = "Авария";
  }

  const currentIndex = currentMacro ? MACRO_STAGE_ORDER.indexOf(currentMacro) : -1;

  const segments: TimelineSegment[] = MACRO_STAGE_ORDER.map((macro, index) => {
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

/** Обёртка: модель полосы из полной телеметрии (или пустой прогресс, если нет кадра). */
export function stageTimelineFromTelemetry(telemetry: Telemetry | null): StageTimeline | null {
  if (!telemetry) return null;
  return computeStageTimeline({
    stage: telemetry.stage,
    pausedFrom: telemetry.pausedFrom,
    stageElapsedSec: telemetry.stageElapsedSec,
    stageRemainingSec: telemetry.stageRemainingSec,
    mashStepIndex: telemetry.mashStepIndex,
    nMashSteps: telemetry.nMashSteps,
  });
}

/** Текущая макро-стадия из телеметрии (для подписи вне компонента), либо null. */
export function currentStageName(telemetry: Telemetry | null): Stage | null {
  return telemetry ? telemetry.stageName : null;
}
