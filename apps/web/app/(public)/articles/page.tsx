import type { Metadata } from "next";
import Link from "next/link";
import { Clock } from "lucide-react";

import { listPublishedContentArticles } from "@/features/content-articles/service";
import { contentArticleTypeLabels } from "@/features/content-articles/contracts";

export const metadata: Metadata = {
  title: "Статьи и обзоры для пивоваров",
  description: "Практические статьи по домашнему пивоварению и обзоры оборудования.",
  alternates: { canonical: "/articles" }
};

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

export default async function ArticlesPage() {
  const articles = await listPublishedContentArticles();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-foreground">Статьи и обзоры</h1>
        <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
          Практические материалы по домашнему пивоварению: пошаговые статьи, разборы процессов и обзоры оборудования.
        </p>
      </header>

      {articles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Материалы скоро появятся.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/articles/${article.slug}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:border-border hover:shadow-md"
            >
              {article.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={article.coverImageUrl}
                  alt={article.title}
                  loading="lazy"
                  decoding="async"
                  className="h-40 w-full object-cover"
                />
              ) : (
                <div className="h-40 w-full bg-gradient-to-br from-amber-50 to-zinc-100 dark:from-amber-500/10 dark:to-zinc-800" aria-hidden />
              )}
              <div className="flex flex-1 flex-col gap-2 p-4">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-warning-subtle-foreground">
                  {contentArticleTypeLabels[article.type]}
                </span>
                <h2 className="text-lg font-semibold leading-snug text-foreground group-hover:text-foreground">{article.title}</h2>
                {article.excerpt ? <p className="line-clamp-3 text-sm text-muted-foreground">{article.excerpt}</p> : null}
                <div className="mt-auto flex items-center gap-3 pt-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden /> {article.readingMinutes} мин</span>
                  {article.publishedAt ? <span>{dateFmt.format(new Date(article.publishedAt))}</span> : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
