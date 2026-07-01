import React from "react";

import type { PublicRecipeListItem } from "@/features/recipes/contracts";
import { defaultPreferredGravityUnit, type PreferredGravityUnit } from "@/features/system/gravity-units";

import { RecipeCard } from "./recipe-card";
import { RecipeListRow } from "./recipe-list-row";
import { RecipeMatchProvider } from "./recipe-match-provider";
import { RecipeSavesProvider } from "./recipe-saves-provider";

/**
 * Витрина `/recipes` (серверный компонент). `grid` — адаптивная сетка карточек;
 * `list` — вертикальный стек горизонтальных строк ({@link RecipeListRow}),
 * удобный для сравнения чисел. Состояние «избранного» — общий провайдер на оба вида.
 */
export function RecipesGrid({
  recipes,
  view = "grid",
  showCloneAction = false,
  preferredGravityUnit = defaultPreferredGravityUnit
}: {
  recipes: PublicRecipeListItem[];
  view?: "grid" | "list";
  showCloneAction?: boolean;
  preferredGravityUnit?: PreferredGravityUnit;
}) {
  const recipeIds = recipes.map((recipe) => recipe.id);

  return (
    <RecipeSavesProvider recipeIds={recipeIds}>
      <RecipeMatchProvider recipeIds={recipeIds}>
        {view === "list" ? (
        <div className="flex flex-col gap-2">
          {recipes.map((recipe) => (
            <RecipeListRow key={recipe.id} recipe={recipe} showCloneAction={showCloneAction} preferredGravityUnit={preferredGravityUnit} />
          ))}
        </div>
      ) : (
        // auto-fit/minmax, а не фиксированные breakpoint-колонки: число колонок считает
        // браузер по реально доступной ширине контейнера, а не по ширине вьюпорта — это
        // важно, потому что ширину сетки режут сразу два сайдбара (nav-рельс приложения
        // + сайдбар фильтров на `xl+`). Минимум 320px держит карточку читаемой: две
        // колонки на обычных десктопах, третья — только на ультрашироких, где AppShell
        // расширяет контент витрины (см. app-shell). На `lg` (1024–1279) сайдбар фильтров
        // убран в sheet, так что сетке достаётся полная ширина и она даёт две колонки,
        // а не одну растянутую.
        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-5">
          {recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} showCloneAction={showCloneAction} preferredGravityUnit={preferredGravityUnit} />
          ))}
        </div>
      )}
      </RecipeMatchProvider>
    </RecipeSavesProvider>
  );
}
