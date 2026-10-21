import React from "react";
import { Copy } from "lucide-react";

import type { RecipeDetailDto } from "@/features/recipes/contracts";
import { formatUpdatedLabel } from "@/features/recipes/format";
import { pluralize } from "@/lib/pluralize";
import { BrewRecipeButton } from "./brew-recipe-button";
import { RecipeHeaderShell } from "./recipe-color-band";
import { CloneFromPublicButton } from "./clone-from-public-button";
import { RecipeSaveButton } from "./recipe-save-button";

export function PublicRecipeHeader({ recipe }: { recipe: RecipeDetailDto }) {
  const cloneCount = recipe.cloneCount ?? 0;

  return (
    <RecipeHeaderShell colorSrm={recipe.color}>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
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
      </div>
    </RecipeHeaderShell>
  );
}
