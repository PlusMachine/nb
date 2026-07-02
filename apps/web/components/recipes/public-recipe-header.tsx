import React from "react";
import { getBeerStyleById } from "@nb/brewing-core";

import { recipePublicationStateLabels, type RecipeDetailDto } from "@/features/recipes/contracts";
import { beerColorFromSrm } from "@/features/recipes/beer-color";
import { formatUpdatedLabel } from "@/features/recipes/format";
import { BeerGlassIcon } from "./beer-glass-icon";
import { BrewRecipeButton } from "./brew-recipe-button";
import { CloneFromPublicButton } from "./clone-from-public-button";
import { RecipeSaveButton } from "./recipe-save-button";

export function PublicRecipeHeader({ recipe }: { recipe: RecipeDetailDto }) {
  const styleName = getBeerStyleById(recipe.styleId)?.name ?? null;
  const color = recipe.color != null && Number.isFinite(recipe.color) ? beerColorFromSrm(recipe.color) : null;
  const srmText = recipe.color != null ? recipe.color.toFixed(1).replace(/\.0$/, "") : null;

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
          <div className="flex flex-wrap items-center gap-2">
            <BrewRecipeButton recipeId={recipe.id} slug={recipe.slug} />
            <CloneFromPublicButton recipeId={recipe.id} slug={recipe.slug} variant="button" />
            <RecipeSaveButton recipeId={recipe.id} slug={recipe.slug} variant="button" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {color && srmText ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600 ring-1 ring-zinc-100">
              <BeerGlassIcon color={color.hex} size={16} className="shrink-0" />
              <span className="tabular-nums">SRM {srmText}</span>
              <span className="text-zinc-400">·</span>
              <span>{color.label}</span>
            </span>
          ) : null}
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
