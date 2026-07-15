import React from "react";
import Link from "next/link";
import { Copy, ExternalLink } from "lucide-react";
import { getBeerStyleById, getBjcpArticleHrefByStyleId, getBjcpStyleDisplayName } from "@nb/brewing-core";

import { recipePublicationStateLabels, type RecipeDetailDto } from "@/features/recipes/contracts";
import { formatUpdatedLabel } from "@/features/recipes/format";
import { inventoryUnitLabels } from "@/features/inventory/units";
import { pluralize } from "@/lib/pluralize";
import { BrewRecipeButton } from "./brew-recipe-button";
import { CloneFromPublicButton } from "./clone-from-public-button";
import { RecipeSaveButton } from "./recipe-save-button";

export function PublicRecipeHeader({ recipe }: { recipe: RecipeDetailDto }) {
  const style = getBeerStyleById(recipe.styleId);
  const styleName = style ? getBjcpStyleDisplayName(style) : null;
  const styleHref = getBjcpArticleHrefByStyleId(recipe.styleId);
  const cloneCount = recipe.cloneCount ?? 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-success-subtle px-2.5 py-0.5 text-xs font-medium text-success-subtle-foreground ring-1 ring-success/30">{recipePublicationStateLabels[recipe.publicationState]}</span>
          {styleName ? (
            styleHref ? (
              <Link
                href={styleHref}
                className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200 underline-offset-2 transition hover:bg-violet-100 hover:text-violet-900 hover:underline dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30 dark:hover:bg-violet-500/20 dark:hover:text-violet-200"
              >
                {`BJCP ${styleName}`}
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
              </Link>
            ) : (
              <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30">
                {`BJCP ${styleName}`}
              </span>
            )
          ) : null}
          <span className="text-xs text-muted-foreground">{formatUpdatedLabel(recipe.updatedAt)}</span>
          {cloneCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Copy className="h-3 w-3" aria-hidden />
              Скопировали {cloneCount} {pluralize(cloneCount, ["раз", "раза", "раз"])}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="break-words text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{recipe.title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <BrewRecipeButton recipeId={recipe.id} slug={recipe.slug} recipeTitle={recipe.title} />
            <CloneFromPublicButton recipeId={recipe.id} slug={recipe.slug} variant="button" />
            <RecipeSaveButton recipeId={recipe.id} slug={recipe.slug} variant="button" />
          </div>
        </div>

        {/* Цвет здесь намеренно не дублируем — он живёт в «Ключевых показателях» сразу под шапкой. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground ring-1 ring-ring">
            {recipe.batchSizeEnteredQuantity} {inventoryUnitLabels[recipe.batchSizeEnteredUnit] ?? recipe.batchSizeEnteredUnit}
          </span>
          <span className="rounded-lg bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground ring-1 ring-ring">
            {recipe.boilTimeMinutes} мин кипячения
          </span>
        </div>
      </div>
    </section>
  );
}
