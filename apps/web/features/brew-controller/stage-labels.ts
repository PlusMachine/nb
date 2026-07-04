// =============================================================================
//  features/brew-controller/stage-labels.ts
//  Человекочитаемые подписи стадий bf_stage_t (H0, P0). Источник значений —
//  @nb/brewforge-protocol (STAGE_NAMES/Stage): Record<Stage, string> заставляет
//  компилятор требовать подпись для КАЖДОЙ из 22 стадий, включая дистилляцию
//  (DISTILL_*) и ферментацию (FERMENT) — герой пульта больше не должен рендерить
//  сырое машинное имя (MASH_STEP, DISTILL_HEARTS…) при приходе телеметрии от
//  дистиллятора/ферментера.
// =============================================================================
import { STAGE_NAMES, type Stage } from "@nb/brewforge-protocol";

export const STAGE_LABELS: Record<Stage, string> = {
  IDLE: "Ожидание",
  DELAYED_START: "Отложенный старт",
  PROMPT_SPARGE: "Вода для промывки",
  DOUGH_IN: "Нагрев до засыпи",
  PROMPT_ADD_MALT: "Засыпь солода",
  MASH_STEP: "Пауза затирания",
  MASH_OUT: "Мэшаут",
  PROMPT_IODINE: "Йодная проба",
  PROMPT_REMOVE_MALT: "Снятие солода",
  BOIL_RAMP: "Выход на кипение",
  BOILING: "Кипячение",
  HOP_STAND: "Хопстенд",
  COOLING: "Охлаждение",
  DONE: "Готово",
  PAUSED: "Пауза",
  MANUAL: "Ручной режим",
  FAULT: "Авария",
  DISTILL_PREHEAT: "Разогрев",
  DISTILL_HEADS: "Отбор голов",
  DISTILL_HEARTS: "Отбор тела",
  DISTILL_TAILS: "Отбор хвостов",
  FERMENT: "Ферментация",
};

/** Человекочитаемая подпись стадии для UI (вместо сырого машинного имени). */
export function stageLabel(stage: Stage): string {
  return STAGE_LABELS[stage];
}

/**
 * То же самое, но от численного bf_stage_t (snapshot-поля/телеметрия хранят
 * стадию числом). Неизвестное значение (повреждённый кадр/будущая прошивка) не
 * падает — раз уж вывести подпись нельзя, честно помечаем номер, а не тихо
 * рендерим что-то похожее на другую стадию.
 */
export function stageLabelForValue(value: number): string {
  const name = STAGE_NAMES[value];
  return name ? STAGE_LABELS[name] : `#${value}`;
}
