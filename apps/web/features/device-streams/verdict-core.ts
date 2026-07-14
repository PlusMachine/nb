// =============================================================================
//  features/device-streams — verdict-core.ts
//  Вердикт состояния брожения (§5 F5). Вход — точки уже сглаженной (median5)
//  кривой активного/последнего сеанса устройства без excluded, ЛИБО ручные
//  замеры партии, когда устройства нет (sessionStartTs=null, П1/F7 — паритет
//  «без устройства»). Чистое ядро без побочных импортов — только числа и
//  Date.now() приходит извне (nowMs), колокированный тест, конвенция *-core.ts
//  (см. parse-core.ts, normalize-core.ts, series-core.ts).
//
//  Порядок проверок ниже (важен, закреплён тестами):
//  1. «Лаг» — падение с начала сеанса ещё не видно (<START_DROP_THRESHOLD_SG):
//     единственная развилка, которая смотрит на elapsed-с-начала, а не на форму
//     кривой (awaiting_start <36ч / not_started ≥36ч).
//  2. Стабильность последних STABILITY_WINDOW_HOURS часов (likely_done/
//     possibly_stuck) — ПРЕЖДЕ скорости (active/slowing), см. §5 F5: «стабильность
//     приоритетнее скорости». Реального конфликта веток 1↔2 нет: если весь ряд
//     плоский с самого начала, дроп с начала <0.003 и лаг-ветка перехватывает его
//     раньше, чем стабильность успела бы ошибочно назвать это «добродило».
//  3. Скорость по последним RATE_WINDOW_HOURS часам (active/slowing) — фолбэк,
//     когда явной стабильности за 48ч ещё не накопилось.
// =============================================================================

export type FermentVerdict =
  | { kind: "awaiting_start" } // «Ждём начала брожения»
  | { kind: "not_started" } // «Брожение не началось?» ⚠
  | { kind: "active" } // «Бродит активно»
  | { kind: "slowing" } // «Дображивает»
  | { kind: "possibly_stuck" } // «Возможен затык» ⚠
  | { kind: "likely_done"; stableDays: number } // «Похоже, добродило»
  | { kind: "insufficient_data" }; // нечего сказать (мало точек)

export type FermentVerdictPoint = { ts: number; gravitySg: number };

export type ComputeFermentVerdictInput = {
  /** Сглаженные точки без excluded, отсортированы по ts возрастанию. */
  points: FermentVerdictPoint[];
  /** Старт сеанса устройства; null — только ручные замеры (старт = ts первого замера). */
  sessionStartTs: number | null;
  /** Расчётный FG из снапшота рецепта партии, если есть. */
  targetFg: number | null;
  nowMs: number;
};

// ---- пороги F5 (константы ядра — в UI не настраиваются, §11) ----

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** <36ч от старта — ещё рано бить тревогу, лаг дрожжей — норма. */
export const AWAITING_START_HOURS = 36;
/** Падение с первой известной точки сеанса меньше этого — «видимой активности ещё нет». */
export const START_DROP_THRESHOLD_SG = 0.003;

/**
 * Окно расчёта скорости падения (F5: «по последним ~24-48ч, реши окно и зафиксируй
 * тестом»). Выбрано 24ч: реагирует быстрее на переход «активно → дображивает», при этом
 * заведомо больше персист-гейта (1 точка/5мин, §8.5) — окну есть чем наполниться даже на
 * свежем сеансе. Зафиксировано тестами на границах ACTIVE/SLOWING ниже.
 */
export const RATE_WINDOW_HOURS = 24;
export const ACTIVE_RATE_SG_PER_DAY = 0.002;
export const SLOWING_RATE_SG_PER_DAY = 0.0005;

/** Окно и допуск «стабильности» для possibly_stuck/likely_done. */
export const STABILITY_WINDOW_HOURS = 48;
export const STABILITY_MAX_CHANGE_SG = 0.0015;

/** Стабильно, но выше расчётного FG больше, чем на это — вероятный затык. */
export const STUCK_ABOVE_TARGET_SG = 0.010;
/** Стабильно и в пределах этого от расчётного FG (либо FG неизвестен) — похоже, добродило. */
export const DONE_NEAR_TARGET_SG = 0.005;

/** Меньше точек — вердикту не на чем считаться (кроме awaiting_start у совсем свежего сеанса). */
export const MIN_POINTS_FOR_VERDICT = 2;

const clampNonNegative = (value: number): number => Math.max(0, value);

/**
 * Скорость падения, SG/сутки, за окно windowHours НАЗАД от последней точки (якорь — конец
 * серии, не nowMs: устройство могло замолчать, это не должно исказить оценку скорости).
 * Опорная точка — последняя, что лежит НЕ ПОЗЖЕ начала окна; если такой нет (вся история
 * короче окна), берём самую первую точку серии — лучшая оценка на доступных данных,
 * окно при этом фактически короче номинального (задокументированное вырождение).
 */
const computeRateSgPerDay = (points: FermentVerdictPoint[], windowHours: number): number => {
  const latest = points[points.length - 1]!;
  const windowStartMs = latest.ts - windowHours * HOUR_MS;
  const priorPoints = points.filter((p) => p.ts <= windowStartMs);
  const reference = priorPoints.length > 0 ? priorPoints[priorPoints.length - 1]! : points[0]!;
  const hoursSpan = (latest.ts - reference.ts) / HOUR_MS;
  if (hoursSpan <= 0) return 0;
  return ((reference.gravitySg - latest.gravitySg) / hoursSpan) * 24;
};

/**
 * Сколько целых суток кривая ПЕРЕД последней точкой держится в коридоре
 * STABILITY_MAX_CHANGE_SG — расширяем окно назад от конца, пока размах (max-min) не
 * превысит порог. Вызывается только когда уже подтверждено ≥STABILITY_WINDOW_HOURS
 * стабильности, поэтому результат всегда ≥2.
 */
const computeStableDays = (points: FermentVerdictPoint[]): number => {
  const last = points[points.length - 1]!;
  let min = last.gravitySg;
  let max = last.gravitySg;
  let stableStartIndex = points.length - 1;

  for (let i = points.length - 2; i >= 0; i--) {
    const value = points[i]!.gravitySg;
    const nextMin = Math.min(min, value);
    const nextMax = Math.max(max, value);
    if (nextMax - nextMin > STABILITY_MAX_CHANGE_SG) break;
    min = nextMin;
    max = nextMax;
    stableStartIndex = i;
  }

  return Math.floor((last.ts - points[stableStartIndex]!.ts) / DAY_MS);
};

export const computeFermentVerdict = (input: ComputeFermentVerdictInput): FermentVerdict => {
  const { points, sessionStartTs, targetFg, nowMs } = input;

  // Пусто/одна точка — сказать нечего, КРОМЕ живого сеанса моложе AWAITING_START_HOURS
  // (устройство ещё физически не успело прислать вторую точку — это тоже «ждём начала»).
  if (points.length < MIN_POINTS_FOR_VERDICT) {
    if (sessionStartTs !== null && nowMs - sessionStartTs < AWAITING_START_HOURS * HOUR_MS) {
      return { kind: "awaiting_start" };
    }
    return { kind: "insufficient_data" };
  }

  // Ручные замеры без сеанса устройства: старт = ts первого замера (П1/F7 — паритет).
  const startTs = sessionStartTs ?? points[0]!.ts;
  const first = points[0]!;
  const latest = points[points.length - 1]!;
  const elapsedMs = nowMs - startTs;

  const dropSinceStartSg = clampNonNegative(first.gravitySg - latest.gravitySg);

  if (dropSinceStartSg < START_DROP_THRESHOLD_SG) {
    return elapsedMs < AWAITING_START_HOURS * HOUR_MS ? { kind: "awaiting_start" } : { kind: "not_started" };
  }

  // Стабильность STABILITY_WINDOW_HOURS — раньше скорости (см. header). Нужна ПОЛНАЯ
  // история за окно (первая точка серии не позже его начала) И минимум 2 точки внутри —
  // одна точка в окне доказывает лишь мгновенное значение, а не стабильность за период
  // (актуально для редких ручных замеров).
  const stabilityWindowStartMs = latest.ts - STABILITY_WINDOW_HOURS * HOUR_MS;
  const hasFullStabilityWindow = first.ts <= stabilityWindowStartMs;

  if (hasFullStabilityWindow) {
    const windowPoints = points.filter((p) => p.ts >= stabilityWindowStartMs);

    if (windowPoints.length >= 2) {
      const values = windowPoints.map((p) => p.gravitySg);
      const change = Math.max(...values) - Math.min(...values);

      if (change <= STABILITY_MAX_CHANGE_SG) {
        const diffAboveTarget = targetFg !== null ? latest.gravitySg - targetFg : null;

        if (diffAboveTarget !== null && diffAboveTarget > STUCK_ABOVE_TARGET_SG) {
          return { kind: "possibly_stuck" };
        }
        if (diffAboveTarget === null || diffAboveTarget <= DONE_NEAR_TARGET_SG) {
          return { kind: "likely_done", stableDays: computeStableDays(points) };
        }
        // Стабильно, но на (DONE_NEAR_TARGET_SG; STUCK_ABOVE_TARGET_SG] выше цели — таблица
        // F5 не именует эту промежуточную зону явно. Трактуем консервативно как «возможен
        // затык»: ошибиться в сторону предупреждения безопаснее, чем ложно сказать
        // «добродило» перед розливом (П5).
        return { kind: "possibly_stuck" };
      }
    }
  }

  const rateSgPerDay = computeRateSgPerDay(points, RATE_WINDOW_HOURS);
  if (rateSgPerDay >= ACTIVE_RATE_SG_PER_DAY) return { kind: "active" };
  if (rateSgPerDay > SLOWING_RATE_SG_PER_DAY) return { kind: "slowing" };
  // Ещё медленнее, но STABILITY_WINDOW_HOURS стабильности не набралось (короткая история
  // или ряд ещё колышется больше STABILITY_MAX_CHANGE_SG) — «дображивает» как самый
  // безопасный дефолт, пока нет оснований для «добродило»/«возможен затык».
  return { kind: "slowing" };
};
