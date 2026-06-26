import { getBjcpCatalogData } from "@nb/content";
import { Bookmark } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import React, { Suspense } from "react";

import { ActiveFilterChips } from "@/components/recipes/active-filter-chips";
import type { RecipeFamilyOption, RecipeStyleOption } from "@/components/recipes/recipes-filter-controls";
import { RecipesFilterSheet } from "@/components/recipes/recipes-filter-sheet";
import { RecipesFilterSidebar } from "@/components/recipes/recipes-filter-sidebar";
import { RecipesGridSkeleton } from "@/components/recipes/recipes-grid-skeleton";
import { RecipesResults, type RawSearchParams } from "@/components/recipes/recipes-results";
import { RecipesToolbar } from "@/components/recipes/recipes-toolbar";
import { parsePublicRecipeFilters } from "@/features/recipes/public-recipe-query";
import { countSavedRecipes, getPublicRecipeFamilyCounts } from "@/features/recipes/service";
import { buildRecipeStyleSearchIndex } from "@/features/recipes/style-search";
import { getSessionUser } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";

export function generateMetadata(): Metadata {
  const { APP_URL } = getServerEnv();
  // Отфильтрованные/постраничные URL канонизируем на /recipes, чтобы не плодить
  // дубли в индексе (§7 ТЗ).
  return {
    title: "Публичные рецепты",
    description: "Готовые рецепты от домашних пивоваров — выберите идею под свой стиль и оборудование. Фильтры по стилю, цвету, крепости и горечи.",
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
  // Залогиненному показываем мостик к его «Избранным» (куда улетают сохранения)
  // с бейджем-счётчиком. Гостю кнопка не нужна — сохранять некуда.
  const viewer = await getSessionUser();
  const savedCount = viewer ? await countSavedRecipes(viewer.id) : 0;
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
      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-zinc-950 sm:text-3xl">Рецепты сообщества</h1>
            <p className="text-sm text-zinc-600">
              Готовые рецепты от других пивоваров — выберите идею под свой стиль и оборудование.
            </p>
          </div>
          {viewer ? (
            <Link
              href="/app/saved"
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
            >
              <Bookmark className="h-4 w-4 text-amber-500" aria-hidden />
              Избранные
              {savedCount > 0 ? (
                <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-zinc-900 px-1.5 text-xs font-semibold text-white">
                  {savedCount}
                </span>
              ) : null}
            </Link>
          ) : null}
        </div>
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
