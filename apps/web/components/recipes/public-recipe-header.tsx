import React from "react";

import { recipePublicationStateLabels, type RecipeDetailDto } from "@/features/recipes/contracts";

export function PublicRecipeHeader({ recipe }: { recipe: RecipeDetailDto }) {
  return (
    <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
        <span className="rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-800">{recipePublicationStateLabels[recipe.publicationState]}</span>
      </div>

      <h1 className="text-2xl font-semibold text-zinc-950 sm:text-3xl">{recipe.title}</h1>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600">
        <p>Объём партии: {recipe.batchSizeEnteredQuantity} {recipe.batchSizeEnteredUnit}</p>
        <p>Обновлён: {recipe.updatedAt.toLocaleDateString("ru-RU")}</p>
      </div>
    </section>
  );
}
