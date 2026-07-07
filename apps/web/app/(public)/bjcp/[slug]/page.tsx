import React, { cache } from "react";
import type { Metadata } from "next";
import { getArticleBySlug, getBjcpCatalogData, listArticles, DEFAULT_BJCP_HERO_IMAGE_URL } from "@nb/content";
import { notFound, permanentRedirect } from "next/navigation";

import { BjcpArticlePage } from "@/components/content/bjcp-article-page";
import { STYLE_RECIPES_LIMIT, type StyleRecipesInitialData } from "@/components/content/style-recipes-provider";
import { listPublicRecipesForStyle } from "@/features/recipes/service";
import { getServerEnv } from "@/lib/env";

// Рецепты стиля тянутся из БД в рантайме (см. loadStyleRecipes ниже) — страница
// устаревает, поэтому раз в час перегенерируем (ISR), а не только на билде.
export const revalidate = 3600;

// Дедуп запроса в пределах одного рендера: generateMetadata и сам компонент
// делят один resolve статьи+алиасов (см. паттерн в catalog/[source]/[id]/page.tsx).
const loadArticle = cache((slug: string) => getArticleBySlug(slug));

/** Есть ли у стиля собственное фото (не общий плейсхолдер BJCP-каталога) — для OG/twitter и Article JSON-LD image. */
const resolveHasRealHeroImage = (article: { heroImageUrl: string | null }) => (
  Boolean(article.heroImageUrl) && article.heroImageUrl !== DEFAULT_BJCP_HERO_IMAGE_URL
);

/**
 * Топ опубликованных рецептов сообщества в стиле — серверно, чтобы карточки и
 * ссылки `/recipes/<slug>` попадали в HTML сразу (A7: раньше грузились только
 * клиентским fetch к /api/recipes/by-style, закрытому в robots — для краулера
 * перелинковки «стиль → рецепты» не существовало).
 *
 * try/catch обязателен: страница использует `generateStaticParams`, а на билде
 * (SSG) БД может быть недоступна — билд не должен из-за этого падать. Пустой
 * фолбэк тут неотличим от «в стиле правда нет рецептов», но клиентский
 * {@link StyleRecipesProvider} в этом случае сам дотянет актуальные данные.
 */
const loadStyleRecipes = async (styleCode: string): Promise<StyleRecipesInitialData> => {
  try {
    const { items, total } = await listPublicRecipesForStyle(styleCode, STYLE_RECIPES_LIMIT);
    return { items, total };
  } catch {
    return null;
  }
};

export async function generateStaticParams() {
  const articles = await listArticles();
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await loadArticle(slug);

  if (!article) {
    return {
      title: "Стиль не найден",
      description: "Запрошенная BJCP-страница недоступна."
    };
  }

  // Легаси-алиасы слага (см. getBjcpArticleSlugAliases в packages/content/src/bjcp.ts)
  // резолвятся в ту же статью, но должны постоянным редиректом сходиться к
  // каноническому /bjcp/<article.slug> — иначе на один стиль живут два 200-URL.
  if (article.slug !== slug) {
    permanentRedirect(`/bjcp/${article.slug}`);
  }

  const { APP_URL } = getServerEnv();
  const canonicalUrl = `${APP_URL}/bjcp/${article.slug}`;
  const hasRealHeroImage = resolveHasRealHeroImage(article);
  const absoluteHeroImageUrl = hasRealHeroImage ? `${APP_URL}${article.heroImageUrl}` : null;

  return {
    title: article.seoTitle,
    description: article.seoDescription,
    keywords: article.keywords,
    alternates: {
      canonical: canonicalUrl
    },
    openGraph: {
      type: "article",
      locale: "ru_RU",
      title: article.seoTitle,
      description: article.seoDescription,
      url: canonicalUrl,
      siteName: "NB",
      tags: article.keywords,
      images: absoluteHeroImageUrl ? [absoluteHeroImageUrl] : undefined
    },
    twitter: absoluteHeroImageUrl
      ? {
        card: "summary_large_image",
        title: article.seoTitle,
        description: article.seoDescription,
        images: [absoluteHeroImageUrl]
      }
      // Без своего фото у стиля — плейсхолдер под "large_image" не объявляем,
      // карточка падает на сайтовый дефолт (app/opengraph-image.png, layout.tsx).
      : undefined
  };
}

export default async function BjcpStylePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await loadArticle(slug);

  if (!article) {
    notFound();
  }

  if (article.slug !== slug) {
    permanentRedirect(`/bjcp/${article.slug}`);
  }

  const [catalog, styleRecipes] = await Promise.all([
    getBjcpCatalogData(),
    loadStyleRecipes(article.bjcpId)
  ]);
  const catalogStyle = catalog.styles.find((style) => style.bjcpId === article.bjcpId) ?? null;
  // Соседние стили категории — для боковой навигации «не тот стиль?». Берём из
  // уже загруженного каталога (файловый контент), без обращения к БД, чтобы
  // страница осталась статической (SSG).
  const siblingStyles = catalog.styles
    .filter((style) => style.categoryId === article.category.id && style.bjcpId !== article.bjcpId)
    .sort((a, b) => a.bjcpId.localeCompare(b.bjcpId, "en", { numeric: true }))
    .map((style) => ({ bjcpId: style.bjcpId, slug: style.slug, title: style.title }));

  return (
    <BjcpArticlePage
      article={article}
      catalogStyle={catalogStyle}
      siblingStyles={siblingStyles}
      initialStyleRecipes={styleRecipes}
      hasRealHeroImage={resolveHasRealHeroImage(article)}
    />
  );
}
