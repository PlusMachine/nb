import React from "react";
import Link from "next/link";
import { getBeerStyleById, getBjcpArticleHrefByStyleId, getBjcpStyleDisplayName } from "@nb/brewing-core";

import { recipePublicationStateLabels, type RecipeDetailDto } from "@/features/recipes/contracts";
import { beerColorFromSrm } from "@/features/recipes/beer-color";
import { formatUpdatedLabel } from "@/features/recipes/format";
import { BeerGlassIcon } from "./beer-glass-icon";
import { BrewRecipeButton } from "./brew-recipe-button";
import { CloneFromPublicButton } from "./clone-from-public-button";
import { RecipeSaveButton } from "./recipe-save-button";

export function PublicRecipeHeader({ recipe }: { recipe: RecipeDetailDto }) {
  const style = getBeerStyleById(recipe.styleId);
  const styleName = style ? getBjcpStyleDisplayName(style) : null;
  const styleHref = getBjcpArticleHrefByStyleId(recipe.styleId);
  const color = recipe.color != null && Number.isFinite(recipe.color) ? beerColorFromSrm(recipe.color) : null;
  const srmText = recipe.color != null ? recipe.color.toFixed(1).replace(/\.0$/, "") : null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-success-subtle px-2.5 py-0.5 text-xs font-medium text-success-subtle-foreground ring-1 ring-success/30">{recipePublicationStateLabels[recipe.publicationState]}</span>
          {styleName ? (
            styleHref ? (
              <Link
                href={styleHref}
                className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200 transition hover:bg-violet-100 hover:text-violet-900 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30 dark:hover:bg-violet-500/20 dark:hover:text-violet-200"
              >
                {styleName}
              </Link>
            ) : (
              <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30">
                {styleName}
              </span>
            )
          ) : null}
          <span className="text-xs text-muted-foreground">{formatUpdatedLabel(recipe.updatedAt)}</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="break-words text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{recipe.title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <BrewRecipeButton recipeId={recipe.id} slug={recipe.slug} recipeTitle={recipe.title} />
            <CloneFromPublicButton recipeId={recipe.id} slug={recipe.slug} variant="button" />
            <RecipeSaveButton recipeId={recipe.id} slug={recipe.slug} variant="button" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {color && srmText ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-ring">
              <BeerGlassIcon color={color.hex} size={16} className="shrink-0" />
              <span className="tabular-nums">SRM {srmText}</span>
              <span className="text-muted-foreground">·</span>
              <span>{color.label}</span>
            </span>
          ) : null}
          <span className="rounded-lg bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground ring-1 ring-ring">
            {recipe.batchSizeEnteredQuantity} {recipe.batchSizeEnteredUnit}
          </span>
          <span className="rounded-lg bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground ring-1 ring-ring">
            {recipe.boilTimeMinutes} мин кипячения
          </span>
        </div>
      </div>
    </section>
  );
}
