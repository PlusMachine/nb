import React from "react";
import Link from "next/link";

import { recipePublicationStateLabels, type RecipeListItemDto } from "@/features/recipes/contracts";
import { formatUpdatedLabel } from "@/features/recipes/format";

import { CloneRecipeButton } from "./clone-recipe-button";
import { DeleteRecipeButton } from "./delete-recipe-button";
import { RecipeStatsSummary } from "./recipe-stats-summary";

export function RecipeList({ recipes }: { recipes: RecipeListItemDto[] }) {
  return (
    <ul className="space-y-3">
      {recipes.map((recipe) => {
        const ownerRecipeHref = `/app/recipes/${recipe.id}/edit`;

        return (
          <li key={recipe.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <article className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-zinc-200 px-2 py-1 text-xs font-medium text-zinc-800">{recipePublicationStateLabels[recipe.publicationState]}</span>
                <span className="text-xs text-zinc-500">{formatUpdatedLabel(recipe.updatedAt)}</span>
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-zinc-950">
                  <Link href={ownerRecipeHref} className="transition-colors hover:text-zinc-700">
                    {recipe.title}
                  </Link>
                </h2>
                <p className="text-sm text-zinc-600">
                  Объём партии: {recipe.batchSizeEnteredQuantity} {recipe.batchSizeEnteredUnit} • кипячение {recipe.boilTimeMinutes} мин
                </p>
              </div>
              <RecipeStatsSummary recipe={recipe} />
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link href={ownerRecipeHref} className="text-sm font-medium text-blue-700 hover:text-blue-900">
                    Открыть рецепт
                  </Link>
                  <span className="text-zinc-400">·</span>
                  <CloneRecipeButton recipeId={recipe.id} />
                  {recipe.publicationState === "published" && recipe.slug
                    ? (
                      <>
                        <span className="text-zinc-400">·</span>
                        <Link href={`/recipes/${recipe.slug}`} className="text-sm font-medium text-emerald-700 hover:text-emerald-900">
                          Публичная страница
                        </Link>
                      </>
                    )
                    : null}
                  <span className="text-zinc-400">·</span>
                  <DeleteRecipeButton recipeId={recipe.id} title={recipe.title} />
                </div>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
