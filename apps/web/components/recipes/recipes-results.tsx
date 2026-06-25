import React from "react";

import type { PublicRecipeFilters } from "@/features/recipes/contracts";
import { searchPublicRecipes } from "@/features/recipes/service";

import { RecipesEmptyState } from "./recipes-empty-state";
import { RecipesGrid } from "./recipes-grid";
import { RecipesPagination } from "./recipes-pagination";

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Активны ли смысловые фильтры (без sort/page) — для выбора варианта empty-state. */
const hasActiveFilters = (filters: PublicRecipeFilters): boolean =>
  Boolean(
    filters.q ||
      filters.family ||
      filters.styleCode ||
      filters.colorMinSrm != null ||
      filters.colorMaxSrm != null ||
      filters.abvMin != null ||
      filters.abvMax != null ||
      filters.ibuMin != null ||
      filters.ibuMax != null
  );

const resultsCountLabel = (total: number): string => {
  const mod10 = total % 10;
  const mod100 = total % 100;
  let noun = "рецептов";
  if (mod10 === 1 && mod100 !== 11) {
    noun = "рецепт";
  } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    noun = "рецепта";
  }
  return `Найдено ${total} ${noun}`;
};

/**
 * Асинхронный серверный поддерево витрины: дергает `searchPublicRecipes`,
 * рендерит счётчик + сетку + интерактивную пагинацию либо empty-state. Вынесен из
 * route-файла, чтобы не нарушать ограничения экспортов страницы Next.
 */
export async function RecipesResults({
  filters,
  view = "grid"
}: {
  filters: PublicRecipeFilters;
  view?: "grid" | "list";
}) {
  const { items, total, page, pageSize } = await searchPublicRecipes(filters);

  if (total === 0) {
    return <RecipesEmptyState variant={hasActiveFilters(filters) ? "no-results" : "no-recipes"} />;
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-500" aria-live="polite">
        {resultsCountLabel(total)}
      </p>

      <RecipesGrid recipes={items} view={view} />

      <RecipesPagination current={page} totalPages={totalPages} />
    </div>
  );
}
