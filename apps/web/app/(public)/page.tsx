import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Clock } from "lucide-react";
import { getBjcpCatalogData } from "@nb/content";

import { HomeBrewforge } from "@/components/home/home-brewforge";
import { HomeCalculators } from "@/components/home/home-calculators";
import { HomeInventory } from "@/components/home/home-inventory";
import { HomeLoop } from "@/components/home/home-loop";
import { HomeStyleVitals } from "@/components/home/home-style-vitals";
import { RecipesGrid } from "@/components/recipes/recipes-grid";
import { getSessionUser } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";
import { srmToHex } from "@/features/recipes/beer-color";
import { buildHeroStyleVitals } from "@/features/home/style-vitals";
import {
  getHomeFeaturedContentArticles,
  getHomeLatestPublicRecipes,
  getHomePublicRecipeFamilyCounts
} from "@/features/home/home-data-cache";
import { jsonLdScriptProps } from "@/features/ingredients/seo";
import { contentArticleTypeLabels } from "@/features/content-articles/contracts";
import { articleCoverFromSlug } from "@/features/content-articles/article-cover";

// Спектр стилей BJCP для баннера — из той же SRM-палитры, что и весь сайт
// (srmToHex по опорным SRM), а не отдельный набор хексов.
const BJCP_SPECTRUM = `linear-gradient(90deg, ${[1, 2, 3, 5, 7, 10, 13, 16, 20, 26, 34, 45]
  .map((srm, index, list) => `${srmToHex(srm)} ${Math.round((index / (list.length - 1)) * 100)}%`)
  .join(", ")})`;

export const metadata: Metadata = {
  description:
    "Соберите рецепт, сверьте со складом и сварите по шагам. Рецепты сообщества, стили BJCP, калькуляторы пивовара и наша автоматика BrewForge."
};

export default async function HomePage() {
  // Залогиненному главная не нужна — его дом это мастерская (единый app-хром).
  const user = await getSessionUser();
  if (user) {
    redirect("/app");
  }

  const [featuredGuides, bjcpCatalog, familyCounts, latestRecipes] = await Promise.all([
    getHomeFeaturedContentArticles(3),
    getBjcpCatalogData(),
    getHomePublicRecipeFamilyCounts(),
    getHomeLatestPublicRecipes()
  ]);
  const { APP_URL, SITE_NAME } = getServerEnv();
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: APP_URL,
    logo: `${APP_URL}/images/pwa/icon-512.png`
  };
  // alternateName сознательно не задан: второго устоявшегося имени у проекта
  // нет (вопрос NB vs hmelo открыт) — добавить при выборе бренда, см. плейбук §14.
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: APP_URL
  };
  const heroStyles = buildHeroStyleVitals(bjcpCatalog.styles);
  const bjcpStyleCount = bjcpCatalog.styles.length;
  // Семейства стилей с рецептами на витрине — тот же контракт, что табы фильтра
  // /recipes (?family=), пустые скрываются (как и там).
  const recipeFamilies = [...bjcpCatalog.families]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((family) => ({ id: family.id, name: family.nameRu, count: familyCounts[family.id] ?? 0 }))
    .filter((family) => family.count > 0);

  // Порядок секций: свежий контент (рецепты, гайды) → продуктовая история
  // (мастерская, склад, BrewForge) → инструменты → финальный CTA.
  return (
    <main className="space-y-16 pb-24 pt-8">
      <section className="overflow-hidden rounded-[2.75rem] border border-border/80 bg-card/90 px-6 py-10 shadow-[0_45px_120px_-70px_rgba(15,23,42,0.45)] backdrop-blur sm:px-8 lg:px-10">
        <div className="grid items-center gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
          <div className="space-y-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Домашнее пивоварение</p>
            <h1 className="max-w-2xl text-balance text-4xl font-semibold leading-[0.98] text-foreground sm:text-5xl lg:text-6xl" style={{ fontFamily: "var(--font-display)" }}>
              Свари своё пиво — от рецепта до розлива
            </h1>
            <p className="max-w-xl text-pretty text-lg leading-8 text-muted-foreground">
              Соберите рецепт — редактор посчитает плотность, горечь и цвет на лету. Сверьте со складом, сварите по шагам и следите за брожением.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/login?next=/app/recipes/new" className="inline-flex items-center rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition-colors hover:bg-foreground/90">
                Собрать рецепт
              </Link>
              <Link href="/recipes" className="inline-flex items-center rounded-full border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:border-border">
                Смотреть рецепты
              </Link>
            </div>
          </div>

          {heroStyles.length ? <HomeStyleVitals styles={heroStyles} /> : null}
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-3xl font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
            Рецепты сообщества
          </h2>
          <Link href="/recipes" className="text-sm font-semibold text-foreground">Все рецепты</Link>
        </div>
        {recipeFamilies.length ? (
          <div className="flex flex-wrap gap-2">
            {recipeFamilies.map((family) => (
              <Link
                key={family.id}
                href={`/recipes?family=${encodeURIComponent(family.id)}`}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-border hover:bg-muted"
              >
                {family.name}
                <span className="text-xs tabular-nums text-muted-foreground">{family.count}</span>
              </Link>
            ))}
          </div>
        ) : null}
        {latestRecipes.items.length ? <RecipesGrid recipes={latestRecipes.items} /> : null}
      </section>

      <section className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-3xl font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
            Разобраться
          </h2>
          <Link href="/articles" className="text-sm font-semibold text-foreground">Все статьи</Link>
        </div>
        {featuredGuides.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featuredGuides.map((guide) => {
              const cover = articleCoverFromSlug(guide.slug);
              return (
              <Link
                key={guide.id}
                href={`/articles/${guide.slug}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:border-border hover:shadow-md"
              >
                {guide.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={guide.coverImageUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-40 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-40 w-full items-center justify-center" style={{ background: cover.background }} aria-hidden>
                    <span
                      className="text-6xl font-semibold leading-none opacity-25"
                      style={{ color: cover.textColor, fontFamily: "var(--font-display)" }}
                    >
                      {guide.title.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-warning-subtle-foreground">{contentArticleTypeLabels[guide.type]}</span>
                  <h3 className="text-lg font-semibold leading-snug text-foreground group-hover:text-foreground">{guide.title}</h3>
                  {guide.excerpt ? <p className="line-clamp-2 text-sm text-muted-foreground">{guide.excerpt}</p> : null}
                  <span className="mt-auto inline-flex items-center gap-1 pt-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" aria-hidden /> {guide.readingMinutes} мин
                  </span>
                </div>
              </Link>
              );
            })}
          </div>
        ) : null}

        <Link
          href="/bjcp"
          className="group block overflow-hidden rounded-[1.25rem] border border-border bg-card shadow-sm transition hover:border-border hover:shadow-md"
        >
          <div className="h-3.5" style={{ background: BJCP_SPECTRUM }} aria-hidden />
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
            <div>
              <div className="text-[17px] font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                Стили пива — справочник BJCP 2021
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {bjcpStyleCount} стилей: от чешского пилснера до имперского стаута
              </p>
            </div>
            <span className="inline-flex items-center rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors group-hover:border-border">
              Открыть справочник
            </span>
          </div>
        </Link>
      </section>

      <section className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-3xl font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
            Как работает мастерская
          </h2>
          <Link href="/login?next=/app/recipes/new" className="text-sm font-semibold text-foreground">Начать</Link>
        </div>
        <HomeLoop />
      </section>

      <HomeInventory />

      <HomeBrewforge />

      <HomeCalculators />

      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/login?next=/app/recipes/new"
          className="group flex flex-col gap-2 rounded-[1.25rem] border border-border bg-card p-6 transition hover:-translate-y-0.5 hover:border-border hover:shadow-md"
        >
          <span className="flex items-center gap-2 text-xl font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
            Начать с рецепта
            <ArrowRight className="ml-auto h-5 w-5 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-muted-foreground" aria-hidden />
          </span>
          <span className="max-w-[44ch] text-sm text-muted-foreground">
            Соберите засыпь и охмеление — редактор посчитает OG, IBU и цвет на лету
          </span>
        </Link>
        <Link
          href="/login?next=/app/ingredients"
          className="group flex flex-col gap-2 rounded-[1.25rem] border border-border bg-card p-6 transition hover:-translate-y-0.5 hover:border-border hover:shadow-md"
        >
          <span className="flex items-center gap-2 text-xl font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
            Начать со склада
            <ArrowRight className="ml-auto h-5 w-5 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-muted-foreground" aria-hidden />
          </span>
          <span className="max-w-[44ch] text-sm text-muted-foreground">
            Занесите запасы — сайт покажет, какие рецепты можно сварить уже сегодня
          </span>
        </Link>
      </section>

      {/* JSON-LD в конце main: первым ребёнком <script> участвует в space-y-16
          и сдвигает видимый контент вниз на его величину. */}
      <script {...jsonLdScriptProps(organizationJsonLd)} />
      <script {...jsonLdScriptProps(websiteJsonLd)} />
    </main>
  );
}
