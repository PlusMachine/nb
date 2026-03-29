import type { Metadata } from "next";
import { getArticleBySlug, listArticles, listRelatedArticles } from "@nb/content";
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

  const relatedArticles = await listRelatedArticles(article, 3);

  return <BjcpArticlePage article={article} relatedArticles={relatedArticles} />;
}
