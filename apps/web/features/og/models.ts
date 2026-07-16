import type { BeerStyle } from "@nb/brewing-core";

import { srmToHex } from "@/features/recipes/beer-color";
import type { RecipeOgData } from "@/features/recipes/contracts";
import { formatAbvShort, formatBatchVolume, formatIbuShort } from "@/features/recipes/format";
import { pluralize } from "@/lib/pluralize";

import { OG_COLORS, resolveTitleFontSize, stripUnsupportedGlyphs, truncateForCard } from "./theme";

// Чистые билдеры view-моделей карточек: (DTO сущности) → плоская модель для
// рендера. Без JSX, без next/og, без fs — тестируется юнит-тестами. Вся
// «человеческая» логика (какие факты показать, как их подписать, обрезка,
// цвет пива) живёт здесь, шаблон card.tsx только раскладывает готовую модель.

export type OgStat = { label: string; value: string };

/**
 * Фирменная вертикальная полоса слева: либо сплошной цвет (SRM сущности), либо
 * вертикальный градиент (диапазон цвета стиля BJCP или SRM-спектр раздела).
 */
export type OgStrip =
  | { kind: "solid"; color: string }
  | { kind: "gradient"; stops: string[] };

/**
 * Строка под статами. «rating» — со звездой (рецепт); «text» — произвольная
 * подпись (напр. «разлито 12.07.2026 · партия #14» на карточке пива).
 */
export type OgSecondaryLine =
  | { kind: "rating"; value: string; count: number; extra?: string | null }
  | { kind: "text"; text: string };

/**
 * Универсальная модель карточки — общий контракт для всех типов сущностей Ф2.
 * Сущность заполняет либо `stats` (лейбл+значение ячейками, как у рецепта),
 * либо `factsLine` (одна строка фактов, как у ингредиента/стиля/пива).
 */
export type OgCardView = {
  eyebrow: string;
  title: string;
  titleFontSize: number;
  /** Мелкая строка под заголовком: titleEn стиля, описание калькулятора и т.п. */
  subtitle?: string | null;
  stats?: OgStat[];
  factsLine?: string | null;
  secondaryLine?: OgSecondaryLine | null;
  strip: OgStrip;
  domain: string;
  wordmark: string;
};

export type RecipeOgView = {
  eyebrow: string;
  title: string;
  titleFontSize: number;
  stats: OgStat[];
  /** Рейтинг для строки под статами — null, если оценок нет. */
  rating: { value: string; count: number } | null;
  /** «сварен N раз» — null, если подтверждённых варок нет. */
  brewedText: string | null;
  /** Цвет фирменной полосы слева: hex цвета пива по SRM или нейтральный. */
  stripColor: string;
  domain: string;
  wordmark: string;
};

const EYEBROW_MAX_LENGTH = 62;
const TITLE_MAX_LENGTH = 64;

const resolveStyleName = (style: BeerStyle | null): string | null =>
  style ? style.nameRu ?? style.name : null;

/** Код BJCP для eyebrow — только осмысленный (не служебный «LEGACY»/пустой). */
const resolveBjcpCode = (style: BeerStyle | null): string | null => {
  if (!style) {
    return null;
  }
  const code = style.bjcpId?.trim();
  if (!code || code.toUpperCase() === "LEGACY") {
    return null;
  }
  return code;
};

/** Плотность как «1.048» (точка, 3 знака) — единый стиль gravity в проекте. */
const formatGravity = (value: number): string => value.toFixed(3);

// Фирменная полоса цвета лежит на тёмном холсте (#09090b). Показываем истинный
// цвет пива по SRM, НО с полом яркости: иначе стаут/портер (near-black) сливается
// со стеной и теряет и цветовой сигнал, и брендовую роль полосы. Домешиваем белый
// строго тёмным цветам (оттенок сохраняется), светлые/янтарные проходят как есть.
const STRIP_LUMINANCE_FLOOR = 64; // 0..255, эмпирически различимо на #09090b

const hexChannels = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const relativeLuminance = ([r, g, b]: [number, number, number]): number =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

const channelToHex = (channel: number): string => Math.round(channel).toString(16).padStart(2, "0");

export const resolveStripColor = (srm: number): string => {
  const hex = srmToHex(srm);
  const rgb = hexChannels(hex);
  const luminance = relativeLuminance(rgb);
  if (luminance >= STRIP_LUMINANCE_FLOOR) {
    return hex;
  }
  // Доля белого, дотягивающая яркость ровно до пола (не больше — оттенок беречь).
  const amount = Math.min(1, (STRIP_LUMINANCE_FLOOR - luminance) / (255 - luminance));
  const [r, g, b] = rgb.map((channel) => channel + (255 - channel) * amount);
  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
};

// Опорные SRM брендового спектра (тот же ряд, что айдентика главной BJCP_SPECTRUM):
// от соломенного к тёмному. Полоса для сущностей без собственного цвета — разделы,
// статьи, мастера. Пол яркости уже вшит в resolveStripColor (тёмный край видим).
const OG_SPECTRUM_SRM = [1.5, 3, 5, 8, 13, 22, 35];

/** Стопы вертикального градиента фирменного SRM-спектра (сверху светлый → снизу тёмный). */
export const buildBrandSpectrumStops = (): string[] => OG_SPECTRUM_SRM.map((srm) => resolveStripColor(srm));

/** Полоса-строб для сущности: сплошной цвет пива по SRM либо нейтраль, если цвета нет. */
export const solidStripFromSrm = (srm: number | null | undefined): OgStrip =>
  srm != null && Number.isFinite(srm)
    ? { kind: "solid", color: resolveStripColor(srm) }
    : { kind: "solid", color: OG_COLORS.neutralStrip };

const sanitizeSecondaryLine = (line: OgSecondaryLine): OgSecondaryLine | null => {
  if (line.kind === "text") {
    const text = stripUnsupportedGlyphs(line.text);
    return text ? { kind: "text", text } : null;
  }
  return {
    kind: "rating",
    value: stripUnsupportedGlyphs(line.value),
    count: line.count,
    extra: line.extra ? stripUnsupportedGlyphs(line.extra) || null : line.extra
  };
};

/**
 * Финальный предохранитель перед Satori: вычищает эмодзи/пиктограммы из ВСЕХ
 * пользовательских текстовых полей карточки (ник автора пива, город мастера,
 * факты бутылки из query…). Satori тянет их SVG с CDN twemoji и роняет рендер
 * посреди стрима, а эту ошибку route try/catch НЕ ловит (docs/specs/og-images.md
 * §7a). Билдеры стрипают только заголовки — здесь закрываем весь остальной
 * free-text одним чоук-пойнтом, чтобы будущий билдер не мог переоткрыть дыру.
 * Опустевшие после стрипа необязательные поля обнуляем (не рисуем пустую строку).
 */
export const sanitizeOgCardView = (view: OgCardView): OgCardView => ({
  ...view,
  eyebrow: stripUnsupportedGlyphs(view.eyebrow),
  title: stripUnsupportedGlyphs(view.title),
  subtitle: view.subtitle ? stripUnsupportedGlyphs(view.subtitle) || null : view.subtitle,
  factsLine: view.factsLine ? stripUnsupportedGlyphs(view.factsLine) || null : view.factsLine,
  stats: view.stats?.map((stat) => ({
    label: stripUnsupportedGlyphs(stat.label),
    value: stripUnsupportedGlyphs(stat.value)
  })),
  secondaryLine: view.secondaryLine ? sanitizeSecondaryLine(view.secondaryLine) : view.secondaryLine
});

export const buildRecipeOgView = (
  recipe: RecipeOgData,
  style: BeerStyle | null,
  opts: { domain: string; wordmark: string }
): RecipeOgView => {
  const styleName = resolveStyleName(style);
  const bjcpCode = resolveBjcpCode(style);

  const eyebrowParts = [
    "Рецепт",
    styleName,
    bjcpCode ? `BJCP ${bjcpCode}` : null
  ].filter((part): part is string => Boolean(part));
  const eyebrow = truncateForCard(eyebrowParts.join(" · "), EYEBROW_MAX_LENGTH);

  const title = truncateForCard(stripUnsupportedGlyphs(recipe.title) || "Рецепт", TITLE_MAX_LENGTH);

  const stats: OgStat[] = [];
  if (recipe.abv != null) {
    stats.push({ label: "ABV", value: formatAbvShort(recipe.abv) });
  }
  if (recipe.ibu != null) {
    stats.push({ label: "IBU", value: formatIbuShort(recipe.ibu) });
  }
  if (recipe.og != null) {
    stats.push({ label: "OG", value: formatGravity(recipe.og) });
  }
  if (recipe.batchSizeNormalizedUnit === "ml") {
    stats.push({ label: "Объём", value: formatBatchVolume(recipe.batchSizeNormalizedQuantity / 1000) });
  }

  const rating = recipe.rating
    ? { value: recipe.rating.average.toFixed(1).replace(".", ","), count: recipe.rating.count }
    : null;

  const brewedText = recipe.completedBrewCount > 0
    ? `сварен ${recipe.completedBrewCount} ${pluralize(recipe.completedBrewCount, ["раз", "раза", "раз"])}`
    : null;

  const stripColor = recipe.color != null ? resolveStripColor(recipe.color) : OG_COLORS.neutralStrip;

  return {
    eyebrow,
    title,
    titleFontSize: resolveTitleFontSize(title),
    stats,
    rating,
    brewedText,
    stripColor,
    domain: opts.domain,
    wordmark: opts.wordmark
  };
};
