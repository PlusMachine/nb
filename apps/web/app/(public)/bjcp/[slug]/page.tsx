import type { Metadata } from "next";
import { getArticleBySlug, getBjcpCatalogData, listArticles } from "@nb/content";
import { notFound } from "next/navigation";

import { BjcpArticlePage } from "@/components/content/bjcp-article-page";
import { getServerEnv } from "@/lib/env";

export async function generateStaticParams() {
  const articles = await listArticles();
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    return {
      title: "Стиль не найден",
      description: "Запрошенная BJCP-страница недоступна."
    };
  }

  const { APP_URL } = getServerEnv();
  const canonicalUrl = `${APP_URL}/bjcp/${article.slug}`;

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
      tags: article.keywords
    },
    twitter: {
      card: "summary_large_image",
      title: article.seoTitle,
      description: article.seoDescription
    }
  };
}

export default async function BjcpStylePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  const catalog = await getBjcpCatalogData();
  const catalogStyle = catalog.styles.find((style) => style.bjcpId === article.bjcpId) ?? null;
  // Соседние стили категории — для боковой навигации «не тот стиль?». Берём из
  // уже загруженного каталога (файловый контент), без обращения к БД, чтобы
  // страница осталась статической (SSG).
  const siblingStyles = catalog.styles
    .filter((style) => style.categoryId === article.category.id && style.bjcpId !== article.bjcpId)
    .sort((a, b) => a.bjcpId.localeCompare(b.bjcpId, "en", { numeric: true }))
    .map((style) => ({ bjcpId: style.bjcpId, slug: style.slug, title: style.title }));

  return <BjcpArticlePage article={article} catalogStyle={catalogStyle} siblingStyles={siblingStyles} />;
}
