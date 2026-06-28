import React from "react";

import type { PublicRecipeListItem } from "@/features/recipes/contracts";

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
  showCloneAction = false
}: {
  recipes: PublicRecipeListItem[];
  view?: "grid" | "list";
  showCloneAction?: boolean;
}) {
  const recipeIds = recipes.map((recipe) => recipe.id);

  return (
    <RecipeSavesProvider recipeIds={recipeIds}>
      <RecipeMatchProvider recipeIds={recipeIds}>
        {view === "list" ? (
        <div className="flex flex-col gap-3">
          {recipes.map((recipe) => (
            <RecipeListRow key={recipe.id} recipe={recipe} showCloneAction={showCloneAction} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} showCloneAction={showCloneAction} />
          ))}
        </div>
      )}
      </RecipeMatchProvider>
    </RecipeSavesProvider>
  );
}
