import React from "react";

import type { PublicRecipeFilters } from "@/features/recipes/contracts";
import { searchPublicRecipes } from "@/features/recipes/service";
import { defaultPreferredGravityUnit, type PreferredGravityUnit } from "@/features/system/gravity-units";

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
  view = "grid",
  preferredGravityUnit = defaultPreferredGravityUnit
}: {
  filters: PublicRecipeFilters;
  view?: "grid" | "list";
  preferredGravityUnit?: PreferredGravityUnit;
}) {
  const { items, total, page, pageSize } = await searchPublicRecipes(filters);

  if (total === 0) {
    const variant = hasActiveFilters(filters) ? "no-results" : "no-recipes";
    // Авторизацию читаем лениво и только для пустой витрины (редкий случай), чтобы
    // не тащить cookie/DB-чтение в общий путь и не связывать компонент с auth.
    let isAuthenticated = false;
    if (variant === "no-recipes") {
      const { getSessionUser } = await import("@/lib/auth");
      isAuthenticated = Boolean(await getSessionUser());
    }
    return <RecipesEmptyState variant={variant} isAuthenticated={isAuthenticated} />;
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div id="recipes-top" className="scroll-mt-4 space-y-6">
      <p className="text-sm text-zinc-500" aria-live="polite">
        {resultsCountLabel(total)}
      </p>

      <RecipesGrid recipes={items} view={view} preferredGravityUnit={preferredGravityUnit} />

      <RecipesPagination current={page} totalPages={totalPages} />
    </div>
  );
}
