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
        <div className="flex flex-col gap-3">
          {recipes.map((recipe) => (
            <RecipeListRow key={recipe.id} recipe={recipe} showCloneAction={showCloneAction} preferredGravityUnit={preferredGravityUnit} />
          ))}
        </div>
      ) : (
        // auto-fit/minmax, а не фиксированные breakpoint-колонки: число колонок считает
        // браузер по реально доступной ширине контейнера, а не по ширине вьюпорта.
        // Сайдбар фильтров съедает нефиксированный кусок ширины сетки — с жёсткими
        // grid-cols-N карточка могла схлопнуться до нечитаемых ~140-220px ровно в
        // диапазоне, где сайдбар уже появился, а вьюпорт ещё не расширился. Минимум
        // 320px: при 260px третья колонка успевала влезть уже на ~1150px экрана —
        // ровно там, где сайдбару и картам вместе не хватает места под название и
        // статы. При 320px три карточки не помещаются даже в самом широком контейнере
        // (max-w-7xl с открытым сайдбаром), так что раскладка всегда 1 или 2 в ряд.
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
