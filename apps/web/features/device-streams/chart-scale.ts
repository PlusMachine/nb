// =============================================================================
//  features/device-streams/chart-scale.ts
//  Чистая логика домена/подписей для ferment-chart.tsx (П2: автоскейл). Без
//  побочных импортов — конвенция *-core.ts, колокированный тест гоняется без БД.
// =============================================================================

export type Bounds = { min: number; max: number };

/**
 * Минимальный домен плотности в SG (~1.5 °P): ниже него старая формула
 * (pad = span*padRatio, при span===0 — pad = |min|*padRatio) на данных около
 * SG≈1.0 раздувает домен до [0.9, 1.1] — после sgToPlato это −26…25 °P.
 */
export const MIN_SPAN_SG = 0.006;

/**
 * Домен оси плотности. При span >= MIN_SPAN_SG — старая формула буквально
 * (регресс-гарантия для длинных серий, включая будущую плотную телеметрию M3).
 * При span < MIN_SPAN_SG (в т.ч. одна точка) — домен расширяется до MIN_SPAN_SG
 * вокруг данных + обычный паддинг. Клэмп только паддинга СНИЗУ: нижняя граница
 * не ниже min(минимум данных, 1.000) — точки ниже 1.000 SG (сильно
 * выброженное пиво) остаются видимыми, искусственно вниз не допадиваем.
 */
export function gravityBounds(values: number[], fallback: Bounds, padRatio = 0.1): Bounds {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return fallback;

  const span = max - min;
  if (span >= MIN_SPAN_SG) {
    const pad = span * padRatio;
    return { min: min - pad, max: max + pad };
  }

  const center = (min + max) / 2;
  const pad = MIN_SPAN_SG * padRatio;
  let lo = center - MIN_SPAN_SG / 2 - pad;
  const hi = center + MIN_SPAN_SG / 2 + pad;

  const lowerLimit = Math.min(min, 1.0);
  if (lo < lowerLimit) lo = lowerLimit;

  return { min: lo, max: hi };
}

export type AxisTimeLabels =
  | { mode: "single"; label: string }
  | { mode: "range"; start: string; end: string };

/** Одна и та же подпись на обоих краях (диапазон уместился в одну единицу форматирования) — рендерить один раз по центру. */
export function axisTimeLabels(startLabel: string, endLabel: string): AxisTimeLabels {
  return startLabel === endLabel ? { mode: "single", label: startLabel } : { mode: "range", start: startLabel, end: endLabel };
}
