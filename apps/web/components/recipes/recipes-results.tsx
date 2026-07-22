import Link from "next/link";
import React from "react";

import { jsonLdScriptProps } from "@/features/ingredients/seo";
import {
  defaultPublicRecipePageSize,
  type PublicRecipeFilters
} from "@/features/recipes/contracts";
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

// Rescue-выдача (С4): ссылка «Показаны результаты для «…»» над счётчиком —
// тот же URL-контракт, что и toolbar/пагинация (public-recipe-query.ts), но
// строится напрямую из уже распарсенных filters (RecipesResults — серверный
// компонент, живого URLSearchParams вызывающей страницы у него нет). page
// намеренно не переносится — новый (скорректированный) запрос начинается с 1-й.
const buildRescueQueryHref = (filters: PublicRecipeFilters, correctedQuery: string): string => {
  const params = new URLSearchParams();
  params.set("q", correctedQuery);
  if (filters.family) {
    params.set("family", filters.family);
  }
  if (filters.styleCode) {
    params.set("style", filters.styleCode);
  }
  if (filters.colorMinSrm != null) {
    params.set("colorMin", String(filters.colorMinSrm));
  }
  if (filters.colorMaxSrm != null) {
    params.set("colorMax", String(filters.colorMaxSrm));
  }
  if (filters.abvMin != null) {
    params.set("abvMin", String(filters.abvMin));
  }
  if (filters.abvMax != null) {
    params.set("abvMax", String(filters.abvMax));
  }
  if (filters.ibuMin != null) {
    params.set("ibuMin", String(filters.ibuMin));
  }
  if (filters.ibuMax != null) {
    params.set("ibuMax", String(filters.ibuMax));
  }
  if (filters.method?.length) {
    params.set("method", filters.method.join(","));
  }
  if (filters.sort !== "newest") {
    params.set("sort", filters.sort);
  }
  if (filters.pageSize !== defaultPublicRecipePageSize) {
    params.set("pageSize", String(filters.pageSize));
  }
  return `/recipes?${params.toString()}`;
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
  const { items, total, page, pageSize, rescue } = await searchPublicRecipes(filters);

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
      {rescue ? (
        <p className="text-sm text-muted-foreground">
          Показаны результаты для «
          <Link
            href={buildRescueQueryHref(filters, rescue.correctedQuery)}
            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            {rescue.correctedQuery}
          </Link>
          »
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {resultsCountLabel(total)}
      </p>

      <RecipesGrid recipes={items} view="list" preferredGravityUnit={preferredGravityUnit} />

      <RecipesPagination current={page} totalPages={totalPages} />

      {itemListJsonLd ? <script {...jsonLdScriptProps(itemListJsonLd)} /> : null}
    </div>
  );
}
