import React from "react";
import { getBeerStyleById } from "@nb/brewing-core";

import { recipePublicationStateLabels, type RecipeDetailDto } from "@/features/recipes/contracts";
import { formatUpdatedLabel } from "@/features/recipes/format";

import { RecipeSaveButton } from "./recipe-save-button";

export function PublicRecipeHeader({ recipe }: { recipe: RecipeDetailDto }) {
  const styleName = getBeerStyleById(recipe.styleId)?.name ?? null;

  return (
    <section className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">{recipePublicationStateLabels[recipe.publicationState]}</span>
          {styleName ? (
            <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200">
              {styleName}
            </span>
          ) : null}
          <span className="text-xs text-zinc-400">{formatUpdatedLabel(recipe.updatedAt)}</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl">{recipe.title}</h1>
          <RecipeSaveButton recipeId={recipe.id} slug={recipe.slug} variant="button" />
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-lg bg-zinc-50 px-2.5 py-1 text-xs font-medium tabular-nums text-zinc-600 ring-1 ring-zinc-100">
            {recipe.batchSizeEnteredQuantity} {recipe.batchSizeEnteredUnit}
          </span>
          <span className="rounded-lg bg-zinc-50 px-2.5 py-1 text-xs font-medium tabular-nums text-zinc-600 ring-1 ring-zinc-100">
            {recipe.boilTimeMinutes} мин кипячения
          </span>
        </div>
      </div>
    </section>
  );
}
