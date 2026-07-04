// =============================================================================
//  @nb/brewforge-protocol — notify.ts
//  Чистая детекция «фронтов» телеметрии для уведомлений (web-push, Phase 6):
//  из пары кадров (предыдущий срез → новый) выделяет СОБЫТИЯ, требующие внимания
//  оператора вне экрана — новый промпт (засыпь/промывка/…) и вновь поднятые
//  аварии. Без побочных эффектов и I/O — тестируется юнитами, переиспользуется
//  и мостом (диспетчер пушей), и порталом (тесты/предпросмотр).
//
//  Дедуп по конструкции: промпт — по смене promptSeq (идемпотентно, один пуш на
//  один промпт); авария — только по НОВЫМ битам маски (raised edge), а не по
//  каждому кадру с активной аварией.
//
//  Ниже — отдельный детектор detectFermentEdges (H3, §12.2): события режима
//  «Ферментация» (отклонение от уставки, конец ступени профиля). Сигнатура
//  detectTelemetryEdges(prev, next) не подходит — детектору нужны монотонное
//  время кадра (окно/кулдаун отклонения — процесс недельный) и своя память
//  (FermentEdgeState), поэтому это соседняя функция, а не ветка внутри старой.
//
//  А события дистилляции (H2, §12.2: «смените приёмную ёмкость», «фракция
//  завершена») — наоборот, ЗАВЕДЕНЫ ВНУТРЬ detectTelemetryEdges/EdgeState:
//  оба события — чистые фронты по сырым полям кадра (actionReady false→true;
//  stage сменился), без времени/окна/кулдауна — тот же характер, что у
//  prompt/fault выше, так что отдельная функция+память была бы дублированием
//  ради дублирования. Подписи фракций сюда намеренно НЕ тащим (см. §13:
//  словарь stage-labels.ts живёт в apps/web) — детектор отдаёт только числовые
//  bf_stage_t (fromStage/toStage), текст собирает @nb/push notification.ts.
// =============================================================================
import { STAGE_NUM, decodeFaults, PROMPT_NAMES, type Fault, type Prompt } from "./enums.js";
import type { Telemetry } from "./telemetry.js";

/** Событие-фронт телеметрии, достойное уведомления. */
export type TelemetryEdge =
  | { kind: "prompt"; prompt: Prompt; promptSeq: number }
  | { kind: "fault"; faults: Fault[] }
  // Ферментация (H3, §12.2): отклонение факта от уставки дольше порога.
  | { kind: "ferment-deviation"; primaryC: number; setpointC: number }
  // Ферментация (H3, §12.2): mashStepIndex сменился — ступень профиля завершена.
  | { kind: "ferment-step-done"; stepIndex: number; nSteps: number; setpointC: number }
  // Дистилляция (H2, §12.2): actionReady поднялся во время активной дистилляции —
  // оператору пора сменить приёмную ёмкость.
  | { kind: "distill-action-ready" }
  // Дистилляция (H2, §12.2): stage сменился внутри цепочки PREHEAT→…→TAILS→DONE
  // (авто-переход или оператор нажал «к следующей фракции» → SKIP_STAGE).
  | { kind: "distill-fraction-done"; fromStage: number; toStage: number };

/** Минимальный срез для детекта фронтов между кадрами (память диспетчера). */
export type EdgeState = { promptSeq: number; prompt: number; faultMask: number; stage: number; actionReady: boolean };

/** Срез памяти фронтов из полного кадра телеметрии. */
export function edgeStateOf(t: Telemetry): EdgeState {
  return {
    promptSeq: t.promptSeq,
    prompt: t.prompt,
    faultMask: t.faultMask,
    stage: t.stage,
    actionReady: t.actionReady === true,
  };
}

/** Стадия дистилляции (bf_stage_t 17..20 — PREHEAT/HEADS/HEARTS/TAILS). */
function isDistillStage(stage: number): boolean {
  return stage >= STAGE_NUM.DISTILL_PREHEAT && stage <= STAGE_NUM.DISTILL_TAILS;
}

/** Безопасное имя промпта (незнакомое числовое значение → null, не бросаем). */
function safePromptName(value: number): Prompt | null {
  const name = PROMPT_NAMES[value];
  return name ?? null;
}

/**
 * Выделить события-фронты между предыдущим срезом и новым кадром.
 *
 * ВАЖНО (анти-спам при рестарте): prev === null (первый кадр устройства в памяти
 * диспетчера) НЕ порождает событий — только сидирование. Иначе рестарт моста
 * среди варки дал бы ложный пуш по текущему промпту/аварии.
 */
export function detectTelemetryEdges(prev: EdgeState | null, next: Telemetry): TelemetryEdge[] {
  const edges: TelemetryEdge[] = [];
  if (prev === null) return edges;

  // Новый промпт: активен (prompt != NONE) И сменился promptSeq (идемпотентно —
  // один пуш на один промпт, даже если он висит много кадров).
  if (next.prompt !== 0 && next.promptSeq !== prev.promptSeq) {
    const name = safePromptName(next.prompt);
    if (name && name !== "NONE") {
      edges.push({ kind: "prompt", prompt: name, promptSeq: next.promptSeq });
    }
  }

  // Вновь поднятые аварии: биты, стоящие в next, но не стоявшие в prev.
  const newlyRaised = next.faultMask & ~prev.faultMask;
  if (newlyRaised !== 0) {
    edges.push({ kind: "fault", faults: decodeFaults(newlyRaised) });
  }

  // Дистилляция (H2, §12.2): actionReady поднялся именно во время активной
  // дистилляции — гейт по next.stage (не prev.stage), чтобы кадр, где стадия и
  // actionReady сменились одновременно, всё равно дал пуш. Фронт по raw-полю
  // (prev.actionReady false/undefined → next true) — повтор пойдёт, только
  // когда actionReady сперва сбросится обратно в false (это делает прибор при
  // смене ёмкости), затем поднимется снова: «повтор только после сброса», а не
  // на каждый кадр с actionReady=true.
  if (isDistillStage(next.stage) && next.actionReady === true && !prev.actionReady) {
    edges.push({ kind: "distill-action-ready" });
  }

  // Дистилляция (H2, §12.2): смена стадии ВНУТРИ цепочки фракций (включая
  // переход в общий терминальный DONE по завершении хвостов) — «фракция
  // завершена». prev.stage должен быть дистилляционным (иначе это вход в
  // дистилляцию извне/начало варки, а не завершение фракции); next.stage —
  // следующая фракция ИЛИ DONE.
  if (
    isDistillStage(prev.stage) &&
    next.stage !== prev.stage &&
    (isDistillStage(next.stage) || next.stage === STAGE_NUM.DONE)
  ) {
    edges.push({ kind: "distill-fraction-done", fromStage: prev.stage, toStage: next.stage });
  }

  return edges;
}

/**
 * Активен ли РУЧНОЙ нагрев (для cloud-плеча dead-man, Phase 6b): плата в MANUAL и
 * нагрев командуется (мгновенный SSR ON или ненулевая скважность). Именно этот
 * сценарий «включил нагрев вручную и ушёл» закрывает firmware dead-man на плате;
 * облако лишь оповещает/дублирует, если управляющий сеанс потерян. Чистая функция.
 */
export function isManualHeatActive(
  t: Pick<Telemetry, "stageName" | "heatOn" | "heatDutyPct">,
): boolean {
  return t.stageName === "MANUAL" && (t.heatOn || t.heatDutyPct > 0);
}

// =============================================================================
//  Ферментация (H3, §12.2) — детекция отклонения от уставки и конца ступени.
// =============================================================================

/** Порог отклонения факта от уставки, °C (решение оркестратора). */
const FERMENT_DEVIATION_THRESHOLD_C = 1.5;
/** Отклонение должно держаться непрерывно столько, прежде чем пушим, мс. */
const FERMENT_DEVIATION_MIN_DURATION_MS = 10 * 60_000; // 10 мин
/** Кулдаун повторного пуша об отклонении, мс (пер-прибор, не пер-эпизод). */
const FERMENT_DEVIATION_COOLDOWN_MS = 4 * 60 * 60_000; // 4 ч

/** Узкий срез кадра, нужный детектору ферментации (не весь Telemetry). */
export type FermentFrame = Pick<Telemetry, "stage" | "primary" | "setpointC" | "mashStepIndex" | "nMashSteps">;

/** Память детектора ферментации на одно устройство между кадрами. */
export interface FermentEdgeState {
  /** wall-clock мс начала непрерывного отклонения; null = сейчас в коридоре. */
  deviationSinceMs: number | null;
  /** wall-clock мс последнего пуша об отклонении (кулдаун §12.2); null = ещё не было. */
  lastDeviationPushMs: number | null;
  /** mashStepIndex предыдущего кадра FERMENT; null = ступень ещё не отслеживалась
   *  (первый кадр устройства ИЛИ только что вошли в FERMENT из другой стадии). */
  lastStepIndex: number | null;
}

/**
 * Выделить события ферментации между предыдущим состоянием детектора и новым
 * кадром: отклонение факта от уставки дольше порога (окно + кулдаун) и конец
 * ступени профиля (смена mashStepIndex, §13-№6). Работает ТОЛЬКО в стадии
 * FERMENT — вне её слежение сбрасывается, чтобы повторный вход в FERMENT не
 * тащил стухшее состояние прошлого эпизода брожения (окно отклонения и индекс
 * ступени; кулдаун пуша — per-device, переживает выход из режима).
 *
 * prev===null (первый кадр устройства в памяти моста, например после рестарта)
 * — сидирование без событий: нулевая длительность отклонения и null-индекс
 * ступени естественно не проходят пороги ниже, так что дополнительный анти-спам
 * гейт не нужен (в отличие от detectTelemetryEdges, где эта подстраховка нужна
 * отдельно — там анти-спам держится на idempotent-по-seq семантике промпта).
 */
export function detectFermentEdges(
  prev: FermentEdgeState | null,
  next: FermentFrame,
  nowMs: number,
): { edges: TelemetryEdge[]; nextState: FermentEdgeState } {
  if (next.stage !== STAGE_NUM.FERMENT) {
    return {
      edges: [],
      nextState: { deviationSinceMs: null, lastDeviationPushMs: prev?.lastDeviationPushMs ?? null, lastStepIndex: null },
    };
  }

  const edges: TelemetryEdge[] = [];

  // --- отклонение от уставки ---
  // Невалидный датчик не считаем отклонением: это уже покрыто отдельной
  // аварией SENSOR (faultMask) — дублировать пуш нет смысла, а на невалидном
  // значении primary.c он был бы ещё и бессмысленным числом в теле.
  const deviatesNow =
    next.primary.valid && Math.abs(next.primary.c - next.setpointC) > FERMENT_DEVIATION_THRESHOLD_C;

  const deviationSinceMs = !deviatesNow
    ? null
    : (prev?.deviationSinceMs ?? nowMs); // отклонение продолжается → не сбрасываем начало окна; только началось → nowMs

  let lastDeviationPushMs = prev?.lastDeviationPushMs ?? null;
  const withinCooldown = lastDeviationPushMs !== null && nowMs - lastDeviationPushMs < FERMENT_DEVIATION_COOLDOWN_MS;
  if (
    deviatesNow &&
    deviationSinceMs !== null &&
    nowMs - deviationSinceMs >= FERMENT_DEVIATION_MIN_DURATION_MS &&
    !withinCooldown
  ) {
    edges.push({ kind: "ferment-deviation", primaryC: next.primary.c, setpointC: next.setpointC });
    lastDeviationPushMs = nowMs;
  }

  // --- конец ступени профиля ---
  const lastStepIndex = prev?.lastStepIndex ?? null;
  if (lastStepIndex !== null && next.mashStepIndex !== lastStepIndex) {
    edges.push({
      kind: "ferment-step-done",
      stepIndex: next.mashStepIndex,
      nSteps: next.nMashSteps,
      setpointC: next.setpointC,
    });
  }

  return {
    edges,
    nextState: { deviationSinceMs, lastDeviationPushMs, lastStepIndex: next.mashStepIndex },
  };
}
