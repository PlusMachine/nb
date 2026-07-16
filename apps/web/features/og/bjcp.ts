import type { ContentArticle } from "@nb/content";

import { joinFacts, normalizeRangeText } from "./format";
import { resolveStripColor, type OgCardView, type OgStrip } from "./models";
import { OG_COLORS, resolveTitleFontSize, stripUnsupportedGlyphs, truncateForCard } from "./theme";

// Карточка стиля BJCP (docs/specs/og-images.md §5.4). Генерится, когда у стиля нет
// собственной иллюстрации (плейсхолдер отсекает роут — resolveHasRealHeroImage).
// Vitals уже приходят готовыми строками-диапазонами; SRM-границы для градиента
// парсим из строки vitalStatistics.srm (числовых srmMin/Max в статье нет).

const TITLE_MAX_LENGTH = 58;

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
  return joinFacts([
    vitals.og ? `OG ${normalizeRangeText(vitals.og)}` : null,
    vitals.ibu ? `IBU ${normalizeRangeText(vitals.ibu)}` : null,
    vitals.abv ? `ABV ${normalizeRangeText(vitals.abv)}` : null
  ]);
};

export const buildBjcpStyleOgView = (
  article: ContentArticle,
  opts: { domain: string; wordmark: string }
): OgCardView => {
  const title = truncateForCard(stripUnsupportedGlyphs(article.title) || "Стиль BJCP", TITLE_MAX_LENGTH);
  const subtitle = article.titleEn && article.titleEn !== article.title
    ? truncateForCard(article.titleEn, 60)
    : null;
  const bjcpId = article.bjcpId?.trim();

  return {
    eyebrow: bjcpId ? `Стиль BJCP · ${bjcpId}` : "Стиль BJCP",
    title,
    titleFontSize: resolveTitleFontSize(title),
    subtitle,
    factsLine: buildFactsLine(article),
    strip: buildStrip(article),
    domain: opts.domain,
    wordmark: opts.wordmark
  };
};
