import { z } from "zod";

// Генератор наклеек на бутылки: контракты и физические константы.
// Термопечать: точная пиксельная сетка под dpi, строго ч/б без полутонов.
// Логика рендера — в features/labels/render.ts, шаблоны — в features/labels/templates/.

export const LABEL_DPI_VALUES = [203, 300] as const;
export type LabelDpi = (typeof LABEL_DPI_VALUES)[number];

// Термоголовки «203 dpi» физически имеют ровно 8 точек/мм (203,2 dpi) —
// считаем по 8, чтобы попадать в родную точечную сетку принтера.
export const pxPerMm = (dpi: LabelDpi): number => (dpi === 203 ? 8 : 300 / 25.4);

export const mmToPx = (mm: number, dpi: LabelDpi): number => Math.round(mm * pxPerMm(dpi));

// Контент-tier совпадает с пресетом размера (S/M/L); A4 — режим листа,
// а не отдельный tier: на листе тиражируется выбранный пресет.
export type LabelTier = "S" | "M" | "L";
export type LabelPresetId = LabelTier;

export type LabelPreset = {
  id: LabelPresetId;
  widthMm: number;
  heightMm: number;
  tier: LabelTier;
  /** Название формата для UI («58×40 мм»). */
  sizeLabel: string;
};

export const LABEL_PRESETS: Record<LabelPresetId, LabelPreset> = {
  S: { id: "S", widthMm: 43, heightMm: 25, tier: "S", sizeLabel: "43×25 мм" },
  M: { id: "M", widthMm: 58, heightMm: 40, tier: "M", sizeLabel: "58×40 мм" },
  L: { id: "L", widthMm: 75, heightMm: 120, tier: "L", sizeLabel: "75×120 мм" }
};

export const LABEL_PRESET_IDS = ["S", "M", "L"] as const satisfies readonly LabelPresetId[];

// Безопасное поле: термопринтеры смещают позиционирование до ~2 мм.
export const SAFE_MARGIN_MM = 2;
// Тоньше 0,25 мм (2 px при 203 dpi) линия печатается нестабильно.
export const MIN_STROKE_MM = 0.25;
// Минимальный размер модуля QR в пикселях растра.
export const QR_MIN_MODULE_PX = 2;
// Целевой печатный размер QR — не меньше 10×10 мм.
export const QR_TARGET_MIN_MM = 10;

// «Готово после» = дата розлива + N дней (карбонизация в бутылке).
export const READY_AFTER_DAYS_DEFAULT = 14;

// Марка внизу наклейки. Строка-плейсхолдер: финальную формулировку (NB/hmelo)
// утверждает владелец продукта.
export const LABEL_BRAND_TEXT = "BREWED WITH NB";

// A4-лист: сетка наклеек выбранного пресета с полями реза и метками.
export const A4_SHEET = {
  widthMm: 210,
  heightMm: 297,
  /** Отступ от краёв листа (непечатаемая зона обычных принтеров). */
  marginMm: 8,
  /** Поле реза между наклейками. */
  gapMm: 3,
  /** Длина уголка-метки реза. */
  cropMarkMm: 3
} as const;

export type A4Grid = {
  cols: number;
  rows: number;
  count: number;
  /** Позиции левых верхних углов наклеек на листе, мм (ось Y — вниз). */
  positions: Array<{ xMm: number; yMm: number }>;
};

/** Раскладка A4: максимум наклеек пресета с полями реза, сетка по центру. */
export const computeA4Grid = (preset: LabelPreset): A4Grid => {
  const usableW = A4_SHEET.widthMm - A4_SHEET.marginMm * 2;
  const usableH = A4_SHEET.heightMm - A4_SHEET.marginMm * 2;
  const cols = Math.floor((usableW + A4_SHEET.gapMm) / (preset.widthMm + A4_SHEET.gapMm));
  const rows = Math.floor((usableH + A4_SHEET.gapMm) / (preset.heightMm + A4_SHEET.gapMm));
  const gridW = cols * preset.widthMm + (cols - 1) * A4_SHEET.gapMm;
  const gridH = rows * preset.heightMm + (rows - 1) * A4_SHEET.gapMm;
  const offsetX = A4_SHEET.marginMm + (usableW - gridW) / 2;
  const offsetY = A4_SHEET.marginMm + (usableH - gridH) / 2;
  const positions: Array<{ xMm: number; yMm: number }> = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      positions.push({
        xMm: offsetX + col * (preset.widthMm + A4_SHEET.gapMm),
        yMm: offsetY + row * (preset.heightMm + A4_SHEET.gapMm)
      });
    }
  }
  return { cols, rows, count: cols * rows, positions };
};

export const LABEL_TEMPLATE_IDS = ["typographic", "craft"] as const;
export type LabelTemplateId = (typeof LABEL_TEMPLATE_IDS)[number];

export const labelRenderRequestSchema = z.object({
  template: z.enum(LABEL_TEMPLATE_IDS).default("typographic"),
  preset: z.enum(LABEL_PRESET_IDS).default("M"),
  /** A4-режим: PDF-лист с сеткой наклеек выбранного пресета. */
  sheet: z
    .enum(["0", "1"])
    .default("0")
    .transform((value) => value === "1"),
  dpi: z
    .enum(["203", "300"])
    .default("203")
    .transform((value) => Number(value) as LabelDpi),
  format: z.enum(["png", "pdf"]).default("png"),
  /** Дата розлива (YYYY-MM-DD); пусто — блоки даты не печатаются. */
  bottlingDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  download: z
    .enum(["0", "1"])
    .default("0")
    .transform((value) => value === "1")
});

export type LabelRenderRequest = z.infer<typeof labelRenderRequestSchema>;

// Слоты данных наклейки. null/пустой массив = блок не рендерится,
// макет схлопывается без дыр (никаких «IBU: —»).
export type LabelSlots = {
  /** Название пива — главный элемент. */
  title: string;
  /** Название стиля BJCP (RU-первое). */
  styleName: string | null;
  /** «~5.9%» — расчётное значение, тильда намеренная. */
  abvText: string | null;
  ibu: number | null;
  /** Округлённый EBC — и для колонки «ЦВЕТ», и для плотности дизеринга. */
  ebc: number | null;
  ogText: string | null;
  fgText: string | null;
  hops: string[];
  malts: string[];
  yeast: string | null;
  authorName: string | null;
  /** «ДД.ММ.ГГГГ» или null — тогда дата и «готово после» не печатаются. */
  bottlingDateText: string | null;
  readyAfterDateText: string | null;
  /** Абсолютный URL публичной страницы рецепта; null для неопубликованных. */
  qrUrl: string | null;
  brandText: string;
};

export const buildLabelFileName = (params: {
  slug: string | null;
  recipeId: string;
  preset: LabelPresetId;
  sheet: boolean;
  dpi: LabelDpi;
  format: "png" | "pdf";
}): string => {
  const base = params.slug && params.slug.length > 0 ? params.slug : params.recipeId;
  const sheetPart = params.sheet ? "-a4" : "";
  return `${base}-${params.preset.toLowerCase()}${sheetPart}-${params.dpi}dpi.${params.format}`;
};
