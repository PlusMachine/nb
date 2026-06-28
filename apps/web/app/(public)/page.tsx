import Link from "next/link";
import { BookOpen, Calculator, Clock, FlaskConical, Sparkles } from "lucide-react";
import { listFeaturedArticles } from "@nb/content";

import { ArticleCard } from "@/components/content/article-card";
import { listFeaturedContentArticles } from "@/features/content-articles/service";
import { contentArticleTypeLabels } from "@/features/content-articles/contracts";

const entryTiles = [
  { href: "/guides", label: "Гайды", icon: BookOpen },
  { href: "/recipes", label: "Рецепты", icon: FlaskConical },
  { href: "/bjcp", label: "Стили BJCP", icon: Sparkles },
  { href: "/calculators", label: "Калькуляторы", icon: Calculator }
];

export default async function HomePage() {
  const [featuredGuides, featuredArticles] = await Promise.all([
    listFeaturedContentArticles(3),
    listFeaturedArticles()
  ]);

  return (
    <main className="space-y-16 pb-24 pt-8">
      <section className="overflow-hidden rounded-[2.75rem] border border-white/80 bg-white/90 px-6 py-10 shadow-[0_45px_120px_-70px_rgba(15,23,42,0.45)] backdrop-blur sm:px-8 lg:px-10">
        <div className="space-y-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Домашнее пивоварение</p>
          <h1 className="max-w-4xl text-balance text-4xl font-semibold leading-[0.98] text-zinc-950 sm:text-5xl lg:text-6xl" style={{ fontFamily: "var(--font-display)" }}>
            Гайды, рецепты и инструменты для домашней варки
          </h1>
          <p className="max-w-2xl text-pretty text-lg leading-8 text-zinc-600">
            Пошаговые материалы, разборы стилей BJCP, калькуляторы и сообщество рецептов — от первого затора до розлива.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/guides" className="inline-flex items-center rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white">
              Читать гайды
            </Link>
            <Link href="/recipes" className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800">
              Рецепты сообщества
            </Link>
          </div>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {entryTiles.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-slate-50 p-4 transition hover:border-zinc-300 hover:bg-white"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-zinc-700 shadow-sm">
                <tile.icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-base font-semibold text-zinc-950">{tile.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {featuredGuides.length ? (
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-3xl font-semibold text-zinc-950" style={{ fontFamily: "var(--font-display)" }}>
              Гайды и обзоры
            </h2>
            <Link href="/guides" className="text-sm font-semibold text-zinc-950">Все гайды</Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featuredGuides.map((guide) => (
              <Link
                key={guide.id}
                href={`/guides/${guide.slug}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:border-zinc-300 hover:shadow-md"
              >
                {guide.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={guide.coverImageUrl} alt="" className="h-40 w-full object-cover" />
                ) : (
                  <div className="h-40 w-full bg-gradient-to-br from-amber-50 to-zinc-100" aria-hidden />
                )}
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">{contentArticleTypeLabels[guide.type]}</span>
                  <h3 className="text-lg font-semibold leading-snug text-zinc-950 group-hover:text-zinc-700">{guide.title}</h3>
                  {guide.excerpt ? <p className="line-clamp-2 text-sm text-zinc-600">{guide.excerpt}</p> : null}
                  <span className="mt-auto inline-flex items-center gap-1 pt-2 text-xs text-zinc-400">
                    <Clock className="h-3.5 w-3.5" aria-hidden /> {guide.readingMinutes} мин
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {featuredArticles.length ? (
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-3xl font-semibold text-zinc-950" style={{ fontFamily: "var(--font-display)" }}>
              Стили BJCP
            </h2>
            <Link href="/bjcp" className="text-sm font-semibold text-zinc-950">Весь раздел</Link>
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
