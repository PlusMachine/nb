import Link from "next/link";
import { listFeaturedArticles } from "@nb/content";

import { ArticleCard } from "@/components/content/article-card";

export default async function HomePage() {
  const featuredArticles = await listFeaturedArticles();

  return (
    <main className="space-y-16 pb-24 pt-8">
      <section className="overflow-hidden rounded-[2.75rem] border border-white/80 bg-white/90 px-6 py-8 shadow-[0_45px_120px_-70px_rgba(15,23,42,0.45)] backdrop-blur sm:px-8 lg:px-10 lg:py-10">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_24rem] lg:items-end">
          <div className="space-y-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">NB knowledge base</p>
            <h1 className="max-w-5xl text-balance text-4xl font-semibold leading-[0.95] text-zinc-950 sm:text-5xl lg:text-6xl" style={{ fontFamily: "var(--font-display)" }}>
              BJCP как отдельный справочный раздел, который можно выборочно выводить на главную
            </h1>
            <p className="max-w-3xl text-pretty text-lg leading-8 text-zinc-600">
              Основной поток чтения теперь должен жить в самостоятельной BJCP-зоне, а главная может показывать только
              выбранные материалы. Это не ломает будущие обзоры оборудования и обычные статьи, но не смешивает их с
              каталогом стилей.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/bjcp"
                className="inline-flex items-center rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white"
              >
                Открыть раздел BJCP
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-[2rem] border border-zinc-200 bg-slate-50 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Раздел</p>
              <p className="mt-3 text-2xl font-semibold text-zinc-950">BJCP</p>
              <p className="mt-2 text-sm leading-6 text-zinc-600">Отдельная зона со стилями, категориями и SEO-friendly страницами.</p>
            </div>
            <div className="rounded-[2rem] border border-zinc-200 bg-slate-50 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Главная</p>
              <p className="mt-3 text-2xl font-semibold text-zinc-950">Featured</p>
              <p className="mt-2 text-sm leading-6 text-zinc-600">Выбранные материалы можно поднимать на витрину, не превращая главную в блог.</p>
            </div>
            <div className="rounded-[2rem] border border-zinc-200 bg-slate-50 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Редакторка</p>
              <p className="mt-3 text-2xl font-semibold text-zinc-950">Tiptap</p>
              <p className="mt-2 text-sm leading-6 text-zinc-600">Подключён как база под будущие обзоры и свободные статьи, не как primary storage для BJCP.</p>
            </div>
          </div>
        </div>
      </section>

      {featuredArticles.length ? (
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">На главной</p>
              <h2 className="mt-2 text-3xl font-semibold text-zinc-950" style={{ fontFamily: "var(--font-display)" }}>
                Выбранные материалы из BJCP
              </h2>
            </div>
            <Link href="/bjcp" className="text-sm font-semibold text-zinc-950">
              Весь раздел BJCP
            </Link>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {featuredArticles.slice(0, 3).map((article, index) => (
              <ArticleCard key={article.slug} article={article} featured={index === 0} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
