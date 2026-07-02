// =============================================================================
//  features/brew-controller/telemetry-annotations.ts
//  Чистое ядро событийных аннотаций графика телеметрии: из последовательности
//  исторических точек выделяет СМЕНЫ СТАДИЙ (вертикальные метки «засыпь / кипение
//  / вирпул /авария …»). Без React/DOM — тестируется юнитами.
//
//  Авторитет — поле stage (bf_stage_t). Метка ставится только на фронте (реальная
//  смена стадии), а не на каждом кадре: MASH_STEP держится через все паузы затора
//  (меняется mashStepIndex, не stage), поэтому меток немного.
// =============================================================================
import { STAGE_NUM } from "@nb/brewforge-protocol";

export type StageTransition = {
  /** epoch-мс точки, на которой стадия сменилась на toStage. */
  ts: number;
  toStage: number;
  fromStage: number | null;
  /** Смена в аварийную стадию — рисуется красным (аномалия). */
  isFault: boolean;
  /** Компактная русская подпись события. */
  label: string;
};

// Компактные подписи событий (короче машинных имён bf_stage_t для меток на графике).
const STAGE_SHORT_LABEL: Record<number, string> = {
  [STAGE_NUM.IDLE]: "Ожидание",
  [STAGE_NUM.DELAYED_START]: "Старт",
  [STAGE_NUM.PROMPT_SPARGE]: "Промывка",
  [STAGE_NUM.DOUGH_IN]: "Засыпь",
  [STAGE_NUM.PROMPT_ADD_MALT]: "Досыпать солод",
  [STAGE_NUM.MASH_STEP]: "Затор",
  [STAGE_NUM.MASH_OUT]: "Мэшаут",
  [STAGE_NUM.PROMPT_IODINE]: "Йодная проба",
  [STAGE_NUM.PROMPT_REMOVE_MALT]: "Убрать солод",
  [STAGE_NUM.BOIL_RAMP]: "Разогрев",
  [STAGE_NUM.BOILING]: "Кипение",
  [STAGE_NUM.HOP_STAND]: "Вирпул",
  [STAGE_NUM.COOLING]: "Охлаждение",
  [STAGE_NUM.DONE]: "Готово",
  [STAGE_NUM.PAUSED]: "Пауза",
  [STAGE_NUM.MANUAL]: "Ручной режим",
  [STAGE_NUM.FAULT]: "Авария",
};

/** Компактная подпись стадии по числовому значению bf_stage_t. */
export function stageShortLabel(stage: number): string {
  return STAGE_SHORT_LABEL[stage] ?? `#${stage}`;
}

/**
 * Выделить смены стадий из истории (oldest→newest) для событийных аннотаций.
 * Метка — только на фронте изменения (первая стадия без метки — она у левого края).
 * Точки без стадии (null) пропускаются и не рвут детект фронта.
 */
export function deriveStageTransitions(
  points: { ts: number; stage: number | null }[],
): StageTransition[] {
  const out: StageTransition[] = [];
  let prev: number | null = null;
  for (const p of points) {
    if (p.stage === null) continue;
    if (prev !== null && p.stage !== prev) {
      out.push({
        ts: p.ts,
        toStage: p.stage,
        fromStage: prev,
        isFault: p.stage === STAGE_NUM.FAULT,
        label: stageShortLabel(p.stage),
      });
    }
    prev = p.stage;
  }
  return out;
}
