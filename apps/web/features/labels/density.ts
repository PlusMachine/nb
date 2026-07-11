import { mmToPx, type LabelDpi } from "./contracts";

// EBC → плотность растрового «серого». Финальный растр — строго 1-бит,
// поэтому тон имитируем регулярным дизерингом: чёрные точки на белом
// (светлое пиво) → белые точки на чёрном (стаут). Плотность квантована в
// дискретные уровни: непрерывная вариация при 203 dpi нестабильна.

export const DITHER_LEVEL_COUNT = 10;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * Доля чёрного 0..1 по EBC. Монотонная, с «плато» на краях:
 * ~0.06 для воды/светлого лагера, ~0.97 для имперского стаута.
 * Степень 0.75 растягивает светлую часть шкалы — там глаз (и термопечать)
 * различают плотность лучше, чем в тёмной.
 */
export const ebcToInkDensity = (ebc: number): number => {
  const clamped = clamp(ebc, 0, 80);
  return clamp(0.06 + 0.91 * Math.pow(clamped / 80, 0.75), 0.06, 0.97);
};

/** Квантованный уровень 0..DITHER_LEVEL_COUNT-1 (для выбора паттерна). */
export const ebcToDitherLevel = (ebc: number): number =>
  Math.min(DITHER_LEVEL_COUNT - 1, Math.floor(ebcToInkDensity(ebc) * DITHER_LEVEL_COUNT));

/**
 * SVG-<pattern> под уровень плотности. Инвариант печати: минимальный
 * элемент (точка или белый просвет) — не меньше 2 px при 203 dpi.
 * До 50% чёрного — чёрные квадраты на белом, дальше — белые на чёрном.
 */
export const ditherPatternDef = (id: string, level: number, dpi: LabelDpi): string => {
  const safeLevel = clamp(Math.round(level), 0, DITHER_LEVEL_COUNT - 1);
  const coverage = (safeLevel + 0.5) / DITHER_LEVEL_COUNT;
  const minDot = Math.max(2, mmToPx(0.25, dpi));

  const dark = coverage > 0.5;
  // Доля площади, которую занимает «точка» (чёрная на белом или белая на чёрной).
  const dotShare = dark ? 1 - coverage : coverage;
  // Базовая ячейка ~0.5 мм; для разреженных уровней ячейку растим, чтобы
  // точка оставалась ≥ minDot, а не мельчала.
  const baseCell = Math.max(4, mmToPx(0.5, dpi));
  let dot = Math.round(baseCell * Math.sqrt(dotShare));
  let cell = baseCell;
  if (dot < minDot) {
    dot = minDot;
    cell = Math.max(baseCell, Math.round(minDot / Math.sqrt(dotShare)));
  }
  dot = Math.min(dot, cell - 1);

  const background = dark ? "black" : "white";
  const dotFill = dark ? "white" : "black";
  const offset = Math.floor((cell - dot) / 2);
  return [
    `<pattern id="${id}" width="${cell}" height="${cell}" patternUnits="userSpaceOnUse">`,
    `<rect width="${cell}" height="${cell}" fill="${background}"/>`,
    `<rect x="${offset}" y="${offset}" width="${dot}" height="${dot}" fill="${dotFill}"/>`,
    `</pattern>`
  ].join("");
};
