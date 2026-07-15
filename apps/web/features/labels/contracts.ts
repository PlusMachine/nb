import { z } from "zod";

import { preferredGravityUnits } from "../system/gravity-units";

// Генератор наклеек на бутылки: контракты и физические константы.
// Термопечать: точная пиксельная сетка под dpi, строго ч/б без полутонов.
// Логика рендера — в features/labels/render.ts, шаблоны — в features/labels/templates/.

// Разрешение растра. Это не «качество печати», а печатная сетка, в которую мы
// растрируем: 1-битная картинка, рассчитанная под 203 dpi, на 300-dpi голове (и
// наоборот) пересчитывается драйвером с некратным множителем — дизеринг идёт
// муаром, линейки 0,25 мм плывут, модули QR дробятся. Поэтому значение обязано
// совпадать с ГОЛОВОЙ принтера, а не выбираться «покрасивее»: студия и
// спрашивает про голову термопринтера (203 или 300 — других у домашних моделей
// практически нет), а не про желаемое качество. У A4-листа выбора нет: его
// печатают на обычном принтере, там 300.
export const LABEL_DPI_VALUES = [203, 300] as const;
export type LabelDpi = (typeof LABEL_DPI_VALUES)[number];
/** Термопринтер по умолчанию: 203 dpi у большинства домашних моделей. */
export const LABEL_DPI_THERMAL: LabelDpi = 203;
/** Обычный принтер (A4-лист): 203 dpi для лазерника просто грубо. */
export const LABEL_DPI_SHEET: LabelDpi = 300;

// Термоголовки «203 dpi» физически имеют ровно 8 точек/мм (203,2 dpi) —
// считаем по 8, чтобы попадать в родную точечную сетку принтера.
export const pxPerMm = (dpi: LabelDpi): number => (dpi === 203 ? 8 : 300 / 25.4);

export const mmToPx = (mm: number, dpi: LabelDpi): number => Math.round(mm * pxPerMm(dpi));

// Контент-tier — это НАБОР блоков наклейки (сколько данных на неё влезает), а
// не её размер: у большой наклейки два пресета одной площади — вертикальный
// 75×120 и горизонтальный 120×75. Оба несут одинаковый контент (tier "L"), но
// раскладываются по-разному: вертикальная — одной колонкой, горизонтальная —
// двумя. A4 — режим листа, а не tier: на листе тиражируется выбранный пресет.
export type LabelTier = "S" | "M" | "L";
export type LabelPresetId = "S" | "M" | "L" | "LW";
export type LabelOrientation = "portrait" | "landscape";

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
  L: { id: "L", widthMm: 75, heightMm: 120, tier: "L", sizeLabel: "75×120 мм" },
  LW: { id: "LW", widthMm: 120, heightMm: 75, tier: "L", sizeLabel: "120×75 мм" }
};

export const LABEL_PRESET_IDS = ["S", "M", "L", "LW"] as const satisfies readonly LabelPresetId[];

export const presetOrientation = (preset: LabelPreset): LabelOrientation =>
  preset.widthMm > preset.heightMm ? "landscape" : "portrait";

/** Большая наклейка — оба её пресета: только там печатаются описание и шкалы. */
export const isLargePreset = (preset: LabelPresetId): boolean => LABEL_PRESETS[preset].tier === "L";

// Безопасное поле: термопринтеры смещают позиционирование до ~2 мм.
export const SAFE_MARGIN_MM = 2;
// Тоньше 0,25 мм (2 px при 203 dpi) линия печатается нестабильно.
export const MIN_STROKE_MM = 0.25;
// Минимальный размер модуля QR в пикселях растра.
export const QR_MIN_MODULE_PX = 2;
// Целевой печатный размер QR — не меньше 10×10 мм.
export const QR_TARGET_MIN_MM = 10;
// Сторона QR на наклейке. S не печатает QR вовсе: на 43×25 мм нет мета-блока,
// и код такого размера всё равно не считался бы.
// 13 мм — не эстетика, а порог печати: при 10 мм и 203 dpi модуль кода для
// реального адреса рецепта (~50–80 символов) выходит мельче 0,25 мм, и QR
// не печатается вовсе. На 13 мм модуль остаётся ≥ 2 px даже для длинных слагов.
export const QR_SIZE_MM_M = 13;
export const QR_SIZE_MM_L = 13;
export const QR_SIZE_MM_BY_TIER: Record<LabelTier, number | null> = { S: null, M: QR_SIZE_MM_M, L: QR_SIZE_MM_L };

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

/**
 * Максимальная длина каждого поля студии — ЕДИНСТВЕННЫЙ источник: отсюда
 * строится и серверная схема, и `maxLength` полей формы. Разъехавшиеся лимиты
 * = форма собирает запрос, который сервер отвергает 400-ым, а превью молча
 * замирает на прошлой картинке.
 */
export const LABEL_FIELD_LIMITS = {
  title: 120,
  style: 80,
  abv: 16,
  ibu: 8,
  ebc: 8,
  og: 12,
  fg: 12,
  malts: 240,
  hops: 240,
  yeast: 80,
  description: 220,
  volume: 16,
  batch: 16,
  author: 60,
  brand: 60,
  recipeSlug: 160
} as const satisfies Record<string, number>;

export type LabelFieldKey = keyof typeof LABEL_FIELD_LIMITS;

/**
 * Потолок числовых полей (IBU/EBC). Цифры печатаются в узкой колонке панели
 * данных и ставят маркер на шкале: 4-значное значение вылезает за колонку, а
 * отрицательное уводит остриё маркера за край наклейки.
 */
export const LABEL_NUMBER_MAX = 999;
/** Шаблон печатает максимум 8 имён и сворачивает остаток в «+N»; дюжина — запас. */
export const LABEL_LIST_MAX_NAMES = 12;
/**
 * Длина одного имени в списке: длиннее шаблон всё равно режет по ширине. Запас
 * над длинными каталожными именами нужен под долю в засыпи — «Caramel/Crystal
 * Malt - 20L 10%» не должен потерять хвост «10%» на обрезке.
 */
export const LABEL_LIST_NAME_MAX_LENGTH = 48;

const limited = (key: LabelFieldKey) => z.string().max(LABEL_FIELD_LIMITS[key]).optional();

/**
 * Правки полей наклейки. Данные подставляются из рецепта автоматически, но
 * любое поле можно переопределить или очистить. Семантика ключа:
 *   ключа нет  → значение из рецепта;
 *   пустая строка → блок не печатать;
 *   значение   → печатать его.
 * Так «очистить поле» отличается от «не трогать».
 */
export const labelOverridesSchema = z.object({
  title: limited("title"),
  style: limited("style"),
  abv: limited("abv"),
  ibu: limited("ibu"),
  ebc: limited("ebc"),
  og: limited("og"),
  fg: limited("fg"),
  /** Списки — через запятую; у солода имя несёт долю в засыпи: «Pale Ale 97%». */
  malts: limited("malts"),
  hops: limited("hops"),
  yeast: limited("yeast"),
  /** Пара предложений о пиве; места хватает только на большой наклейке. */
  description: limited("description"),
  /** Эмблема (шишка хмеля в «Крафте»); выключается правкой. */
  logo: z.enum(["0", "1"]).optional(),
  /** Шкала горечи на большой наклейке; выключается правкой. */
  ibuScale: z.enum(["0", "1"]).optional(),
  /** Объём тары («0,5 л») — реквизит бутылки, не объём варки. */
  volume: limited("volume"),
  /** Номер партии — печатается как «ПАРТИЯ №3». */
  batch: limited("batch"),
  author: limited("author"),
  brand: limited("brand"),
  /**
   * Рецепт, на который ведёт QR (ручной режим /labels): слаг публичной страницы
   * либо полный URL нашего домена. Произвольные ссылки не принимаем — иначе
   * публичный эндпоинт становится генератором QR на любой сайт с нашего домена.
   */
  recipeSlug: limited("recipeSlug"),
  /** Выключить QR можно всегда; включить — только у опубликованного рецепта. */
  qr: z.enum(["0", "1"]).optional()
});

export type LabelOverrides = z.infer<typeof labelOverridesSchema>;

/**
 * Приводит ввод «ссылка на рецепт» к слагу. Принимает голый слаг и полный URL
 * страницы рецепта или страницы пива (/recipes/…, /beer/…) — но только нашего
 * домена: QR печатается с нашего бренда, и вести он должен на наш рецепт, а не
 * на произвольный сайт. Всё остальное — null (QR просто не появится).
 */
export const parseRecipeSlugInput = (input: string, baseUrl: string): string | null => {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
  if (slugPattern.test(trimmed)) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    const base = new URL(baseUrl);
    if (url.host !== base.host) {
      return null;
    }
    const match = /^\/(?:recipes|beer)\/([^/?#]+)\/?$/.exec(url.pathname);
    const slug = match ? decodeURIComponent(match[1]) : null;
    return slug && slugPattern.test(slug) ? slug : null;
  } catch {
    return null;
  }
};

/**
 * Дата розлива печатается как есть, поэтому проверяем не только формат, но и
 * календарь: `new Date("2026-02-31")` молча переносит на 03.03.2026, а
 * «9999-99-99» — на 07.06.10007 (вектор — ссылка, не форма: там `<input
 * type="date">`).
 */
export const isValidIsoDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

export const labelRenderRequestSchema = labelOverridesSchema.extend({
  template: z.enum(LABEL_TEMPLATE_IDS).default("typographic"),
  preset: z.enum(LABEL_PRESET_IDS).default("M"),
  /**
   * Шкала OG/FG. Значения полей приходят голыми числами («15.2»), единицу
   * печатает шаблон — и он должен знать какую. Не задана — берётся из профиля
   * (у анонима °P): плотность в СНГ указывают в Плато.
   */
  gravityUnit: z.enum(preferredGravityUnits).optional(),
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
  /** Экранное превью: сглаженный рендер вместо 1-бит растра. */
  preview: z
    .enum(["0", "1"])
    .default("0")
    .transform((value) => value === "1"),
  /** Дата розлива (YYYY-MM-DD); пусто — блоки даты не печатаются. */
  bottlingDate: z.string().refine(isValidIsoDate).optional(),
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
  /** Голое число без единицы («15.2», «1.048») — единицу печатает шаблон. */
  ogText: string | null;
  fgText: string | null;
  /** Суффикс шкалы OG/FG («°P», «°Bx»); null у SG — там суффикс не пишут. */
  gravityUnitText: string | null;
  hops: string[];
  /**
   * Солод. Доля в засыпи — часть имени сорта («Pale Ale 97%»), а не отдельное
   * поле: список приходит из формы одной строкой, и что в поле — то и печатается.
   * Не нужна — стирается там же, руками. У хмеля долей нет: по массе они врали бы
   * (30 г на горечь и 30 г на сухое охмеление — это не «50 / 50»).
   */
  malts: string[];
  yeast: string | null;
  /** Пара предложений о пиве; печатается только на большой наклейке (на S/M нет места). */
  description: string | null;
  /** Печатать эмблему (шишка хмеля в «Крафте»). */
  showLogo: boolean;
  /** Печатать шкалу горечи (большая наклейка). */
  showIbuScale: boolean;
  /** Объём тары («0,5 л»); печатается строкой «0,5 Л · ПАРТИЯ №3». */
  volumeText: string | null;
  /** Номер партии («3» или «№3»); печатается в той же строке, что и объём. */
  batchText: string | null;
  authorName: string | null;
  /** «ДД.ММ.ГГГГ» или null — тогда дата не печатается. */
  bottlingDateText: string | null;
  /** Абсолютный URL публичной страницы рецепта; null для неопубликованных. */
  qrUrl: string | null;
  /** Марка внизу наклейки; null — не печатать. */
  brandText: string | null;
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
