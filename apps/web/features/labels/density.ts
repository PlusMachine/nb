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
 * SVG-<pattern> под уровень плотности — упорядоченный дизеринг по матрице
 * Байера 4×4: ячейка это сетка 4×4 точек, чёрными становятся первые N позиций
 * в порядке матрицы. Тон кодируется ЧИСЛОМ точек, а не их размером — точка
 * остаётся ≥ 2 px (инвариант печати), а уровней выходит 16.
 *
 * Через размер точки это не работает: при 203 dpi доступны диаметры 2, 3, 4 px,
 * то есть светлая половина шкалы вырождалась в один и тот же узор.
 */
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
];

const BAYER_STEPS = 16;

export const ditherPatternDef = (id: string, level: number, dpi: LabelDpi): string => {
  const safeLevel = clamp(Math.round(level), 0, DITHER_LEVEL_COUNT - 1);
  const coverage = (safeLevel + 0.5) / DITHER_LEVEL_COUNT;
  // Хотя бы одна точка и не все 16: на краях шкала не должна вырождаться
  // в чистый белый или сплошной чёрный — иначе теряется сам факт градации.
  const dots = clamp(Math.round(coverage * BAYER_STEPS), 1, BAYER_STEPS - 1);

  // Точка ≥ 2 px при 203 dpi; шаг сетки ~1 мм — крупный, устойчивый к печати.
  const dotPx = Math.max(2, mmToPx(0.25, dpi));
  const cell = dotPx * 4;

  const rects: string[] = [];
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      if (BAYER_4X4[row][col] < dots) {
        rects.push(`<rect x="${col * dotPx}" y="${row * dotPx}" width="${dotPx}" height="${dotPx}"/>`);
      }
    }
  }

  return [
    `<pattern id="${id}" width="${cell}" height="${cell}" patternUnits="userSpaceOnUse">`,
    `<rect width="${cell}" height="${cell}" fill="white"/>`,
    `<g fill="black">${rects.join("")}</g>`,
    `</pattern>`
  ].join("");
};
