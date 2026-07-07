import React, { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { getArticleBySlug } from "@nb/content";

import { TiptapContent } from "@/components/content/tiptap-content";
import { contentArticleTypeLabels } from "@/features/content-articles/contracts";
import { getRelatedLinksForArticle } from "@/features/content-articles/related-links";
import { buildArticleBlogPostingJsonLd, buildArticleBreadcrumbJsonLd, buildArticleMetadata } from "@/features/content-articles/seo";
import { getPublishedContentArticleBySlug } from "@/features/content-articles/service";
import { jsonLdScriptProps } from "@/features/ingredients/seo";
import { getServerEnv } from "@/lib/env";

// Статья не читает cookies()/headers() → страница остаётся кэшируемой (ISR).
export const revalidate = 300;

// Дедуп запроса в пределах одного рендера: generateMetadata и сам компонент
// делят один SELECT статьи (см. паттерн в catalog/[source]/[id]/page.tsx).
const loadArticle = cache((slug: string) => getPublishedContentArticleBySlug(slug));

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await loadArticle(slug);

  if (article) {
    return buildArticleMetadata(article);
  }

  // Легаси: до переезда на CMS BJCP-статьи (@nb/content) жили на /articles/<slug>.
  // Старые ссылки/индекс должны получить постоянный редирект на новый канонический
  // /bjcp/<slug>, а не 404. notFound()/permanentRedirect именно здесь, в
  // generateMetadata — иначе стриминг тела успеет отдать 200 до того, как
  // решится статус страницы.
  const legacyArticle = await getArticleBySlug(slug);
  if (legacyArticle) {
    permanentRedirect(`/bjcp/${legacyArticle.slug}`);
  }
  notFound();
}

export default async function ArticleDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await loadArticle(slug);

  if (!article) {
    const legacyArticle = await getArticleBySlug(slug);
    if (legacyArticle) {
      permanentRedirect(`/bjcp/${legacyArticle.slug}`);
    }
    notFound();
  }

  const { APP_URL } = getServerEnv();
  const blogPostingJsonLd = buildArticleBlogPostingJsonLd(article, { baseUrl: APP_URL });
  const breadcrumbJsonLd = buildArticleBreadcrumbJsonLd(article, { baseUrl: APP_URL });
  const relatedLinks = getRelatedLinksForArticle(article.slug);
  const publishedLabel = article.publishedAt ? dateFmt.format(article.publishedAt) : null;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href="/" className="transition hover:text-foreground">Главная</Link></li>
          <li aria-hidden="true">/</li>
          <li><Link href="/articles" className="transition hover:text-foreground">Статьи</Link></li>
          <li aria-hidden="true">/</li>
          <li className="text-foreground">{article.title}</li>
        </ol>
      </nav>

      <header className="space-y-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-warning-subtle-foreground">
          {contentArticleTypeLabels[article.type]}
        </span>
        <h1 className="text-3xl font-semibold leading-tight text-foreground sm:text-4xl">{article.title}</h1>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span>{article.authorName ?? "Редакция NB"}</span>
          {publishedLabel ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{publishedLabel}</span>
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          <span>{article.readingMinutes} мин</span>
        </div>
      </header>

      {article.coverImageUrl ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-muted" style={{ aspectRatio: "16 / 9" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={article.coverImageUrl} alt={article.title} className="h-full w-full object-cover" />
        </div>
      ) : null}

      <TiptapContent doc={article.bodyJson} />

      <section className="space-y-3 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Дальше</h2>
        <ul className="space-y-2">
          {relatedLinks.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="text-sm font-medium text-link underline underline-offset-4">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <script {...jsonLdScriptProps(blogPostingJsonLd)} />
      <script {...jsonLdScriptProps(breadcrumbJsonLd)} />
    </main>
  );
}
