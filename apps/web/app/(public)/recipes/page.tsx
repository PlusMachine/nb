import { getBjcpCatalogData } from "@nb/content";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import React, { Suspense } from "react";

import { ActiveFilterChips } from "@/components/recipes/active-filter-chips";
import { RecipeTabs } from "@/components/recipes/recipe-tabs";
import type { RecipeFamilyOption, RecipeStyleOption } from "@/components/recipes/recipes-filter-controls";
import { RecipesFilterSheet } from "@/components/recipes/recipes-filter-sheet";
import { RecipesFilterSidebar } from "@/components/recipes/recipes-filter-sidebar";
import { RecipesGridSkeleton } from "@/components/recipes/recipes-grid-skeleton";
import { RecipesResults, type RawSearchParams } from "@/components/recipes/recipes-results";
import { RecipesToolbar } from "@/components/recipes/recipes-toolbar";
import { parsePublicRecipeFilters } from "@/features/recipes/public-recipe-query";
import { RECIPES_VIEW_COOKIE, parseRecipesView } from "@/features/recipes/recipes-url";
import { buildPublicRecipeListMetadata } from "@/features/recipes/seo";
import { getPublicRecipeFamilyCounts, getPublicRecipeSortAvailability } from "@/features/recipes/service";
import { buildRecipeStyleSearchIndex } from "@/features/recipes/style-search";
import { getSessionUser } from "@/lib/auth";

export async function generateMetadata({ searchParams }: { searchParams?: Promise<RawSearchParams> }): Promise<Metadata> {
  const raw = (searchParams ? await searchParams : {}) as RawSearchParams;
  // Чистый ?page=N (N≥2, без других параметров) — self-canonical; любые
  // фильтры/sort/view канонизируем на голый /recipes, чтобы не плодить дубли
  // отфильтрованных выборок в индексе (§7 ТЗ).
  return buildPublicRecipeListMetadata(raw);
}

export default async function PublicRecipesPage({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const raw = (searchParams ? await searchParams : {}) as RawSearchParams;
  const filters = parsePublicRecipeFilters(raw);
  // Вид: явный ?view выигрывает; иначе — запомненный в cookie выбор; иначе сетка.
  const cookieStore = await cookies();
  const view =
    parseRecipesView(typeof raw.view === "string" ? raw.view : undefined) ??
    parseRecipesView(cookieStore.get(RECIPES_VIEW_COOKIE)?.value) ??
    "grid";

  // Слим-данные BJCP для клиентских контролов (без N+1 — один статический фетч).
  const catalog = await getBjcpCatalogData();
  // Компактный поисковый индекс для пикера стиля (умный поиск + чипы семейств).
  const styleIndex = buildRecipeStyleSearchIndex(catalog);
  // Число рецептов на витрине в каждом семействе (пустые семейства скрываются).
  const familyCounts = await getPublicRecipeFamilyCounts();
  // Наличие данных для сортов «По рейтингу»/«Популярные» (count-conditional показ).
  const sortAvailability = await getPublicRecipeSortAvailability();
  // Залогиненному показываем хаб-табы (Мои / Сохранённые / Найти); гостю — нет.
  const viewer = await getSessionUser();
  // Лёгкие опции для лейблов активных чипов (резолв id/code → название).
  const familyOptions: RecipeFamilyOption[] = [...catalog.families]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((family) => ({ id: family.id, name: family.nameRu }));
  const styleOptions: RecipeStyleOption[] = catalog.styles.map((style) => ({
    code: style.bjcpId,
    name: style.title,
    familyIds: style.familyIds
  }));

  return (
    <main className="space-y-6 py-8">
      {viewer ? <RecipeTabs /> : null}

      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">Рецепты сообщества</h1>
          <p className="text-sm text-muted-foreground">
            Готовые рецепты от других пивоваров — выберите идею под свой стиль и оборудование.
          </p>
        </div>
      </section>

      {/* Сайдбар фильтров включаем только с `xl`, а не с `lg`: у залогиненного к
          сетке уже прижат глобальный nav-рельс приложения (w-60), и на `lg`
          (1024–1279) рельс + сайдбар фильтров вместе съедали ширину так, что grid
          схлопывался в одну растянутую колонку, а list-строки обрезались. В этом
          диапазоне фильтры доступны кнопкой-sheet (ниже тулбара). */}
      <div className="grid gap-6 xl:grid-cols-[260px_1fr]">
        <RecipesFilterSidebar index={styleIndex} familyCounts={familyCounts} />

        <div className="min-w-0 space-y-4">
          {/* Управление выдачей (поиск/сортировка/вид) собрано над результатами;
              инпуты фильтров — в сайдбаре слева (мобильный/планшетный sheet — ниже).
              Тулбар sticky: при длинной ленте поиск/сортировка/переключатель вида не
              уезжают. Оффсет — под текущий хром (`--chrome-top`: мобильная шапка
              AppShell/публичный хедер или 0, где хрома над контентом нет). */}
          <div className="sticky top-[var(--chrome-top)] z-30 -my-1 bg-background/90 py-1 backdrop-blur">
            <RecipesToolbar defaultView={view} sortAvailability={sortAvailability} />
          </div>
          <RecipesFilterSheet index={styleIndex} familyCounts={familyCounts} />
          <ActiveFilterChips familyOptions={familyOptions} styleOptions={styleOptions} />

          <Suspense fallback={<RecipesGridSkeleton view={view} />}>
            <RecipesResults filters={filters} view={view} preferredGravityUnit={viewer?.preferredGravityUnit} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
