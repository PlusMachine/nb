import type { ContentArticleDto } from "@/features/content-articles/contracts";

import { formatPublishDateRu, joinFacts } from "./format";
import { buildBrandSpectrumStops, type OgCardView } from "./models";
import { resolveTitleFontSize, stripUnsupportedGlyphs, truncateForCard } from "./theme";

// Карточка статьи без обложки (docs/specs/og-images.md §5.5). Со своей обложкой
// статья остаётся на ней (og:image = coverImageUrl) — генерённая карточка только
// как замена сайтовому дефолту. Полоса — фирменный SRM-спектр (своего цвета у
// статьи нет).

const TITLE_MAX_LENGTH = 62;

const buildFactsLine = (article: ContentArticleDto): string | null => {
  const minutes = article.readingMinutes > 0 ? `${article.readingMinutes} мин чтения` : null;
  const date = formatPublishDateRu(article.publishedAt ?? article.createdAt);
  return joinFacts([minutes, date]);
};

export const buildArticleOgView = (
  article: ContentArticleDto,
  opts: { domain: string; wordmark: string }
): OgCardView => {
  const title = truncateForCard(stripUnsupportedGlyphs(article.title) || "Статья", TITLE_MAX_LENGTH);

  return {
    eyebrow: "Статья",
    title,
    titleFontSize: resolveTitleFontSize(title),
    subtitle: article.authorName ? `Автор — ${article.authorName}` : null,
    factsLine: buildFactsLine(article),
    strip: { kind: "gradient", stops: buildBrandSpectrumStops() },
    domain: opts.domain,
    wordmark: opts.wordmark
  };
};
