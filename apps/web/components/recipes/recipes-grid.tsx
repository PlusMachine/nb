import React from "react";

import type { PublicRecipeListItem } from "@/features/recipes/contracts";

import { RecipeCard } from "./recipe-card";
import { RecipeSavesProvider } from "./recipe-saves-provider";

/** Адаптивная сетка карточек витрины `/recipes` (серверный компонент). */
export function RecipesGrid({
  recipes,
  view = "grid"
}: {
  recipes: PublicRecipeListItem[];
  view?: "grid" | "list";
}) {
  const layout =
    view === "list"
      ? "grid grid-cols-1 gap-4 sm:grid-cols-2"
      : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

  return (
    <RecipeSavesProvider recipeIds={recipes.map((recipe) => recipe.id)}>
      <div className={layout}>
        {recipes.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} />
        ))}
      </div>
    </RecipeSavesProvider>
  );
}
