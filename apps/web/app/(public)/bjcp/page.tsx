import type { Metadata } from "next";
import { listArticleCategories, listArticles } from "@nb/content";

import { BjcpBrowser } from "@/components/content/bjcp-browser";

export const metadata: Metadata = {
  title: "BJCP справочник",
  description: "Русскоязычный раздел BJCP в современном формате: навигация по категориям, страницы стилей и SEO-friendly структура."
};

export default async function BjcpPage() {
  const [articles, categories] = await Promise.all([
    listArticles(),
    listArticleCategories()
  ]);

  return (
    <main className="space-y-14 pb-24 pt-8">
      <section className="overflow-hidden rounded-[2.75rem] border border-white/80 bg-white/90 px-6 py-8 shadow-[0_45px_120px_-70px_rgba(15,23,42,0.45)] backdrop-blur sm:px-8 lg:px-10 lg:py-10">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_22rem] lg:items-end">
          <div className="space-y-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">BJCP section</p>
            <h1 className="max-w-5xl text-balance text-4xl font-semibold leading-[0.95] text-zinc-950 sm:text-5xl lg:text-6xl" style={{ fontFamily: "var(--font-display)" }}>
              Справочник BJCP с навигацией сначала по категориям, затем по стилям
            </h1>
            <p className="max-w-3xl text-pretty text-lg leading-8 text-zinc-600">
              Раздел отделён от остальных статей и работает как самостоятельная библиотека стилей: понятный обзор по
              категориям, чистые карточки и короткие SEO-friendly страницы без лишней навигационной перегрузки.
            </p>
          </div>

          <div className="grid gap-3">
            <div className="rounded-[2rem] border border-zinc-200 bg-slate-50 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Категории</p>
              <p className="mt-3 text-4xl font-semibold text-zinc-950">{categories.length}</p>
            </div>
            <div className="rounded-[2rem] border border-zinc-200 bg-slate-50 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Стили</p>
              <p className="mt-3 text-4xl font-semibold text-zinc-950">{articles.length}</p>
            </div>
          </div>
        </div>
      </section>

      <BjcpBrowser articles={articles} categories={categories} />
    </main>
  );
}
