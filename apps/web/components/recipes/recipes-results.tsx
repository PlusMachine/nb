import React from "react";

import { jsonLdScriptProps } from "@/features/ingredients/seo";
import type { PublicRecipeFilters } from "@/features/recipes/contracts";
import { buildPublicRecipeItemListJsonLd } from "@/features/recipes/seo";
import { searchPublicRecipes } from "@/features/recipes/service";
import { defaultPreferredGravityUnit, type PreferredGravityUnit } from "@/features/system/gravity-units";
import { getServerEnv } from "@/lib/env";

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
 * рендерит счётчик + список строк + интерактивную пагинацию либо empty-state.
 * Вынесен из route-файла, чтобы не нарушать ограничения экспортов страницы Next.
 */
export async function RecipesResults({
  filters,
  preferredGravityUnit = defaultPreferredGravityUnit
}: {
  filters: PublicRecipeFilters;
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
  // ItemList размечает только чистую (без свободного поиска) выборку — со
  // свободным текстовым запросом список не самостоятельная сущность для индекса.
  const itemListJsonLd = !filters.q
    ? buildPublicRecipeItemListJsonLd(items, {
      baseUrl: getServerEnv().APP_URL,
      offset: (page - 1) * pageSize
    })
    : null;

  return (
    <div id="recipes-top" className="scroll-mt-4 space-y-6">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {resultsCountLabel(total)}
      </p>

      <RecipesGrid recipes={items} view="list" preferredGravityUnit={preferredGravityUnit} />

      <RecipesPagination current={page} totalPages={totalPages} />

      {itemListJsonLd ? <script {...jsonLdScriptProps(itemListJsonLd)} /> : null}
    </div>
  );
}
