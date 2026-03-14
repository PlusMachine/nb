import React from "react";
import Link from "next/link";

import { recipePublicationStateLabels, type RecipeListItemDto } from "@/features/recipes/contracts";
import { formatUpdatedLabel } from "@/features/recipes/format";

import { RecipeStatsSummary } from "./recipe-stats-summary";

export function PublicRecipeList({ recipes }: { recipes: RecipeListItemDto[] }) {
  return (
    <ul className="space-y-3">
      {recipes.map((recipe) => (
        <li key={recipe.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <article className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
              <span className="rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-800">{recipePublicationStateLabels[recipe.publicationState]}</span>
              <span>{formatUpdatedLabel(recipe.updatedAt)}</span>
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-zinc-950">{recipe.title}</h2>
              <p className="text-sm text-zinc-600">Объём партии: {recipe.batchSizeEnteredQuantity} {recipe.batchSizeEnteredUnit} • кипячение {recipe.boilTimeMinutes} мин</p>
            </div>

            <RecipeStatsSummary recipe={recipe} />

            <div>
              <Link
                href={`/recipes/${recipe.slug}`}
                className="text-sm font-medium text-blue-700 hover:text-blue-900"
              >
                Открыть рецепт
              </Link>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}
