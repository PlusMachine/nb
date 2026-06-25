/**
 * Чистые хелперы маппинга «слайдер ↔ URL-параметры» для диапазонных фильтров
 * `/recipes` (ABV, IBU). Граница диапазона = «нет фильтра»: если нижний thumb на
 * 0, нижней границы нет (param опускается); если верхний на `bound` — верхней нет.
 * Это совпадает с серверным контрактом (отсутствующий param = безграничный).
 */

export type RangeBound = { min: number; max: number; step: number };

const clamp = (value: number, lo: number, hi: number): number => Math.min(Math.max(value, lo), hi);

/** Округление к шагу, чтобы убрать дрожание float (0.30000001 → 0.3). */
const snap = (value: number, step: number): number => {
  const snapped = Math.round(value / step) * step;
  // Нормализуем кол-во знаков по шагу (0.1 → 1 знак, 1 → 0 знаков).
  const decimals = step < 1 ? String(step).split(".")[1]?.length ?? 0 : 0;
  return Number(snapped.toFixed(decimals));
};

/** Текущее значение слайдера из URL-параметров (отсутствие → граница диапазона). */
export const sliderValueFromParams = (
  minParam: string | null,
  maxParam: string | null,
  bound: RangeBound
): [number, number] => {
  const rawMin = minParam == null || minParam.trim() === "" ? bound.min : Number(minParam);
  const rawMax = maxParam == null || maxParam.trim() === "" ? bound.max : Number(maxParam);
  let min = Number.isFinite(rawMin) ? clamp(rawMin, bound.min, bound.max) : bound.min;
  let max = Number.isFinite(rawMax) ? clamp(rawMax, bound.min, bound.max) : bound.max;
  if (min > max) {
    [min, max] = [max, min];
  }
  return [snap(min, bound.step), snap(max, bound.step)];
};

/** Значение слайдера → патч URL. Границы диапазона маппятся в `null` (нет фильтра). */
export const rangeSliderToParams = (
  value: [number, number],
  bound: RangeBound
): { min: string | null; max: string | null } => {
  const [rawMin, rawMax] = value;
  const min = snap(clamp(rawMin, bound.min, bound.max), bound.step);
  const max = snap(clamp(rawMax, bound.min, bound.max), bound.step);
  return {
    min: min <= bound.min ? null : String(min),
    max: max >= bound.max ? null : String(max)
  };
};

/** Подпись активного диапазона для слайдера (числа + «любой» на краях). */
export const formatSliderRange = (
  value: [number, number],
  bound: RangeBound,
  unit = ""
): string => {
  const [min, max] = value;
  const atMin = min <= bound.min;
  const atMax = max >= bound.max;
  const suffix = unit ? ` ${unit}` : "";
  if (atMin && atMax) {
    return "любой";
  }
  if (atMin) {
    return `до ${max}${suffix}`;
  }
  if (atMax) {
    return `от ${min}${suffix}`;
  }
  return `${min} – ${max}${suffix}`;
};

export const abvBound: RangeBound = { min: 0, max: 20, step: 0.1 };
export const ibuBound: RangeBound = { min: 0, max: 200, step: 1 };
