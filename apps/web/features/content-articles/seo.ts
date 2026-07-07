import type { Metadata } from "next";

import type { ContentArticleDto } from "./contracts";
import { extractPlainText } from "./reading-time";

// SEO-фундамент деталки редакционных статей (/articles/<slug>): metadata и
// JSON-LD (BlogPosting/BreadcrumbList). Билдеры по образцу
// features/ingredients/seo.ts: jsonLdScriptProps переиспользуем оттуда,
// truncateAtWordBoundary там не экспортирован — держим локальный аналог.

const ARTICLE_DESCRIPTION_MAX_LENGTH = 200;

// Обрезает по границе слова, а не посередине — вместо ровно maxLength
// символов отдаёт чуть меньше, зато без разорванного слова перед «…».
const truncateAtWordBoundary = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }

  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  const safeCut = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
  return `${safeCut.trimEnd()}…`;
};

const buildArticleDescription = (article: Pick<ContentArticleDto, "seoDescription" | "excerpt" | "bodyJson">): string => {
  const seoOrExcerpt = article.seoDescription?.trim() || article.excerpt?.trim();
  const source = seoOrExcerpt || extractPlainText(article.bodyJson, 400);
  return truncateAtWordBoundary(source, ARTICLE_DESCRIPTION_MAX_LENGTH);
};

const isAbsoluteUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const resolveAbsoluteImageUrl = (baseUrl: string, coverImageUrl: string): string =>
  isAbsoluteUrl(coverImageUrl) ? coverImageUrl : `${baseUrl}${coverImageUrl}`;

export const buildArticleMetadata = (article: ContentArticleDto): Metadata => {
  const title = article.seoTitle ?? article.title;
  const description = buildArticleDescription(article);
  const canonicalPath = `/articles/${article.slug}`;
  const hasCover = Boolean(article.coverImageUrl);
  const publishedTime = (article.publishedAt ?? article.createdAt).toISOString();
  const modifiedTime = article.updatedAt.toISOString();

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath
    },
    openGraph: {
      type: "article",
      url: canonicalPath,
      title,
      description,
      images: hasCover ? [article.coverImageUrl as string] : undefined,
      publishedTime,
      modifiedTime,
      locale: "ru_RU"
    },
    twitter: {
      card: hasCover ? "summary_large_image" : "summary",
      title,
      description
    }
  };
};

export const buildArticleBlogPostingJsonLd = (
  article: ContentArticleDto,
  params: { baseUrl: string }
): object => {
  const base = params.baseUrl.replace(/\/$/, "");
  const url = `${base}/articles/${article.slug}`;
  const description = buildArticleDescription(article);

  const payload: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description,
    datePublished: (article.publishedAt ?? article.createdAt).toISOString(),
    dateModified: article.updatedAt.toISOString(),
    author: {
      "@type": "Person",
      name: article.authorName ?? "Редакция NB"
    },
    mainEntityOfPage: url,
    publisher: {
      "@type": "Organization",
      name: "NB"
    }
  };

  if (article.coverImageUrl) {
    payload.image = resolveAbsoluteImageUrl(base, article.coverImageUrl);
  }

  return payload;
};

export const buildArticleBreadcrumbJsonLd = (
  article: Pick<ContentArticleDto, "title" | "slug">,
  params: { baseUrl: string }
): object => {
  const base = params.baseUrl.replace(/\/$/, "");

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Главная", item: base || "/" },
      { "@type": "ListItem", position: 2, name: "Статьи", item: `${base}/articles` },
      { "@type": "ListItem", position: 3, name: article.title, item: `${base}/articles/${article.slug}` }
    ]
  };
};

// jsonLdScriptProps уже экспортирован из features/ingredients/seo.ts —
// переиспользуем его там, где нужно сериализовать эти билдеры в <script>,
// вместо дублирования здесь.
