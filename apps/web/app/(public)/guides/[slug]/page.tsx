import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock } from "lucide-react";

import { getPublishedContentArticleBySlug } from "@/features/content-articles/service";
import { contentArticleTypeLabels } from "@/features/content-articles/contracts";
import { TiptapContent } from "@/components/content/tiptap-content";

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

// Дедуп запроса в пределах одного рендера: generateMetadata и сам компонент
// делят один SELECT по slug.
const loadArticle = cache(getPublishedContentArticleBySlug);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await loadArticle(slug);
  if (!article) {
    return { title: "Статья не найдена" };
  }
  const title = article.seoTitle ?? article.title;
  const description = article.seoDescription ?? article.excerpt ?? undefined;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      images: article.coverImageUrl ? [{ url: article.coverImageUrl }] : undefined,
      publishedTime: article.publishedAt ? article.publishedAt.toISOString() : undefined
    },
    twitter: { card: "summary_large_image", title, description }
  };
}

export default async function GuideArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await loadArticle(slug);
  if (!article) {
    notFound();
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": article.type === "review" ? "Review" : "Article",
    headline: article.title,
    description: article.seoDescription ?? article.excerpt ?? undefined,
    image: article.coverImageUrl ?? undefined,
    datePublished: article.publishedAt ? article.publishedAt.toISOString() : undefined,
    dateModified: article.updatedAt.toISOString(),
    author: article.authorName ? { "@type": "Person", name: article.authorName } : undefined
  };

  return (
    <article className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <div>
        <Link href="/guides" className="inline-flex items-center gap-1 text-sm text-zinc-500 transition hover:text-zinc-800">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Все гайды
        </Link>
      </div>

      <header className="space-y-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
          {contentArticleTypeLabels[article.type]}
        </span>
        <h1 className="text-3xl font-semibold leading-tight text-zinc-950">{article.title}</h1>
        {article.excerpt ? <p className="text-base leading-7 text-zinc-600">{article.excerpt}</p> : null}
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
          {article.authorName ? <span>{article.authorName}</span> : null}
          {article.publishedAt ? <span>{dateFmt.format(new Date(article.publishedAt))}</span> : null}
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden /> {article.readingMinutes} мин</span>
        </div>
      </header>

      {article.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={article.coverImageUrl} alt="" className="w-full rounded-2xl object-cover" />
      ) : null}

      <TiptapContent doc={article.bodyJson} />
    </article>
  );
}
