import type { ContentArticle } from "@nb/content";

import { defaultPreferredGravityUnit, formatGravity, formatGravityRange } from "@/features/system/gravity-units";

import { joinFacts, normalizeRangeText } from "./format";
import { resolveStripColor, type OgCardView, type OgPhoto, type OgStrip } from "./models";
import { OG_COLORS, resolveTitleFontSize, stripUnsupportedGlyphs, truncateForCard } from "./theme";

// Карточка стиля BJCP (docs/specs/og-images.md §5.4). Раньше генерилась только
// когда у стиля нет собственной иллюстрации; с Ф5 стиль С иллюстрацией тоже
// получает эту карточку — иллюстрация встраивается фото-врезкой (opts.photo,
// см. features/og/photo.ts:loadBjcpOgPhoto), а не отдаётся сырым PNG в og:image.
// Vitals уже приходят готовыми строками-диапазонами; SRM-границы для градиента
// парсим из строки vitalStatistics.srm (числовых srmMin/Max в статье нет).

const TITLE_MAX_LENGTH = 58;

/**
 * Не даёт Satori перенести строку факта посреди токена (напр. «ABV 4.3–5.6%»
 * ломается посреди эн-дэша диапазона, docs/specs/og-images.md §5.4 полировка
 * Ф5) — схлопывает обычные пробелы внутри КАЖДОГО факта в неразрывные, так что
 * факт становится единым неразрывным блоком; joinFacts (features/og/format.ts,
 * общий для нескольких билдеров — здесь НЕ трогаем) склеивает такие блоки
 * обычным « · » с обычными пробелами вокруг — перенос при нехватке ширины
 * возможен только по границе факта, никогда внутри него. Локально для BJCP.
 */
const NBSP = " ";
const preventInternalWrap = (fact: string): string => fact.replace(/ /g, NBSP);

/**
 * Кегль строки фактов ступенями по её длине — по образцу resolveTitleFontSize
 * (theme.ts), но только для карточки С фото-врезкой (Ф5): контентная колонка
 * там ~640px вместо обычных ~1040 (1200 − 16 полоса − 2×72 паддинги − 400
 * врезка), и дефолтный кегль 34 не помещает даже типичную строку вида «OG
 * 11.0–13.1 °P · IBU 8–15 · ABV 4.3–5.6%» в одну строку. Ступени
 * подобраны живым Satori-рендером всех 128 стилей BJCP (реальные длины 39–133
 * симв., подавляющее большинство — 39–43): обычная строка помещается в одну
 * строку, самые длинные (описательные vitals категории 33 «varies with base
 * style», 133 симв.) переносятся по границе факта, не более чем на 2 строки.
 */
const resolveFactsLineFontSize = (line: string): number => {
  const length = line.length;
  if (length <= 45) return 28;
  if (length <= 70) return 24;
  if (length <= 110) return 20;
  return 17;
};

/** Границы SRM из строки вида «6 – 14» → [min, max]. Пусто/без цифр → null. */
const parseSrmRange = (srm: string | null): [number, number] | null => {
  if (!srm) {
    return null;
  }
  const nums = srm.match(/\d+(?:\.\d+)?/g)?.map(Number).filter((value) => Number.isFinite(value));
  if (!nums || nums.length === 0) {
    return null;
  }
  return [nums[0], nums[nums.length - 1]];
};

const buildStrip = (article: ContentArticle): OgStrip => {
  const range = parseSrmRange(article.vitalStatistics.srm);
  if (!range) {
    return { kind: "solid", color: OG_COLORS.neutralStrip };
  }
  const from = resolveStripColor(range[0]);
  const to = resolveStripColor(range[1]);
  return from === to ? { kind: "solid", color: from } : { kind: "gradient", stops: [from, to] };
};

const buildFactsLine = (article: ContentArticle): string | null => {
  const vitals = article.vitalStatistics;
  // Меняем только SG-значения и диапазоны, сохраняя пояснения и составные диапазоны BJCP.
  const og = vitals.og?.replace(
    /\b([01]\.\d{3,})(?:\s*[-‐-―]\s*([01]\.\d{3,}))?(?:\s*SG\b)?/g,
    (_match, min: string, max: string | undefined) => max
      ? formatGravityRange(Number(min), Number(max), defaultPreferredGravityUnit)!
      : formatGravity(Number(min), defaultPreferredGravityUnit)
  );
  return joinFacts([
    og ? preventInternalWrap(`OG ${normalizeRangeText(og)}`) : null,
    vitals.ibu ? preventInternalWrap(`IBU ${normalizeRangeText(vitals.ibu)}`) : null,
    vitals.abv ? preventInternalWrap(`ABV ${normalizeRangeText(vitals.abv)}`) : null
  ]);
};

export const buildBjcpStyleOgView = (
  article: ContentArticle,
  opts: { domain: string; wordmark: string; photo?: OgPhoto | null }
): OgCardView => {
  const title = truncateForCard(stripUnsupportedGlyphs(article.title) || "Стиль BJCP", TITLE_MAX_LENGTH);
  const subtitle = article.titleEn && article.titleEn !== article.title
    ? truncateForCard(article.titleEn, 60)
    : null;
  const bjcpId = article.bjcpId?.trim();

  // Ф5: с фото-врезкой контентная колонка уже, кегль капается — как у рецепта
  // (features/og/models.ts:buildRecipeOgView). Без фото раскладка не меняется.
  const titleFontSize = opts.photo
    ? Math.min(resolveTitleFontSize(title), 50)
    : resolveTitleFontSize(title);

  const factsLine = buildFactsLine(article);
  // Ф5-полировка: кегль factsLine капается только с фото-врезкой (см.
  // resolveFactsLineFontSize) — без фото card.tsx берёт дефолт 34, раскладка
  // карточки без иллюстрации не меняется.
  const factsLineFontSize = opts.photo && factsLine ? resolveFactsLineFontSize(factsLine) : undefined;

  return {
    eyebrow: bjcpId ? `Стиль BJCP · ${bjcpId}` : "Стиль BJCP",
    title,
    titleFontSize,
    subtitle,
    factsLine,
    factsLineFontSize,
    strip: buildStrip(article),
    domain: opts.domain,
    wordmark: opts.wordmark,
    photo: opts.photo ?? null
  };
};
