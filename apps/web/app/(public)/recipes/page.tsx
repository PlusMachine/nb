import { getBjcpCatalogData } from "@nb/content";
import type { Metadata } from "next";
import React, { Suspense } from "react";

import { ActiveFilterChips } from "@/components/recipes/active-filter-chips";
import type { RecipeFamilyOption, RecipeStyleOption } from "@/components/recipes/recipes-filter-controls";
import { RecipesFilterSheet } from "@/components/recipes/recipes-filter-sheet";
import { RecipesFilterSidebar } from "@/components/recipes/recipes-filter-sidebar";
import { RecipesGridSkeleton } from "@/components/recipes/recipes-grid-skeleton";
import { RecipesResults, type RawSearchParams } from "@/components/recipes/recipes-results";
import { RecipesToolbar } from "@/components/recipes/recipes-toolbar";
import { parsePublicRecipeFilters } from "@/features/recipes/public-recipe-query";
import { getPublicRecipeFamilyCounts } from "@/features/recipes/service";
import { buildRecipeStyleSearchIndex } from "@/features/recipes/style-search";
import { getServerEnv } from "@/lib/env";

export function generateMetadata(): Metadata {
  const { APP_URL } = getServerEnv();
  // Отфильтрованные/постраничные URL канонизируем на /recipes, чтобы не плодить
  // дубли в индексе (§7 ТЗ).
  return {
    title: "Публичные рецепты",
    description: "Рецепты сообщества домашних пивоваров: фильтры по стилю, цвету, крепости и горечи.",
    alternates: {
      canonical: `${APP_URL}/recipes`
    }
  };
}

export default async function PublicRecipesPage({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const raw = (searchParams ? await searchParams : {}) as RawSearchParams;
  const filters = parsePublicRecipeFilters(raw);
  const view = raw.view === "list" ? "list" : "grid";

  // Слим-данные BJCP для клиентских контролов (без N+1 — один статический фетч).
  const catalog = await getBjcpCatalogData();
  // Компактный поисковый индекс для пикера стиля (умный поиск + чипы семейств).
  const styleIndex = buildRecipeStyleSearchIndex(catalog);
  // Число рецептов на витрине в каждом семействе (пустые семейства скрываются).
  const familyCounts = await getPublicRecipeFamilyCounts();
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
      <section className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-6">
        <h1 className="text-2xl font-semibold text-zinc-950 sm:text-3xl">Рецепты сообщества</h1>
        <p className="text-sm text-zinc-600">
          Опубликованные рецепты домашних пивоваров — с цветом пива, стилем и ключевыми показателями варки.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <RecipesFilterSidebar index={styleIndex} familyCounts={familyCounts} />

        <div className="min-w-0 space-y-4">
          {/* Управление выдачей (поиск/сортировка/вид) собрано над результатами;
              инпуты фильтров — в сайдбаре слева (мобильный sheet — ниже). */}
          <RecipesToolbar />
          <RecipesFilterSheet index={styleIndex} familyCounts={familyCounts} />
          <ActiveFilterChips familyOptions={familyOptions} styleOptions={styleOptions} />

          <Suspense fallback={<RecipesGridSkeleton view={view} />}>
            <RecipesResults filters={filters} view={view} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
