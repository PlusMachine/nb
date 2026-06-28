import type { Metadata } from "next";
import Link from "next/link";
import { Clock } from "lucide-react";

import { listPublishedContentArticles } from "@/features/content-articles/service";
import { contentArticleTypeLabels } from "@/features/content-articles/contracts";

export const metadata: Metadata = {
  title: "Гайды и обзоры для пивоваров",
  description: "Практические гайды по домашнему пивоварению и обзоры оборудования."
};

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

export default async function GuidesPage() {
  const articles = await listPublishedContentArticles();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-zinc-950">Гайды и обзоры</h1>
        <p className="max-w-2xl text-sm leading-7 text-zinc-600">
          Практические материалы по домашнему пивоварению: пошаговые гайды, разборы процессов и обзоры оборудования.
        </p>
      </header>

      {articles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
          Материалы скоро появятся.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/guides/${article.slug}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:border-zinc-300 hover:shadow-md"
            >
              {article.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={article.coverImageUrl} alt="" className="h-40 w-full object-cover" />
              ) : (
                <div className="h-40 w-full bg-gradient-to-br from-amber-50 to-zinc-100" aria-hidden />
              )}
              <div className="flex flex-1 flex-col gap-2 p-4">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                  {contentArticleTypeLabels[article.type]}
                </span>
                <h2 className="text-lg font-semibold leading-snug text-zinc-950 group-hover:text-zinc-700">{article.title}</h2>
                {article.excerpt ? <p className="line-clamp-3 text-sm text-zinc-600">{article.excerpt}</p> : null}
                <div className="mt-auto flex items-center gap-3 pt-2 text-xs text-zinc-400">
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
