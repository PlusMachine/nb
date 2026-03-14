import React from "react";

import type { RecipeDetailDto } from "@/features/recipes/contracts";

import { PublicRecipeHeader } from "./public-recipe-header";
import { RecipeIngredientsSection } from "./recipe-ingredients-section";
import { RecipeMetaSection } from "./recipe-meta-section";
import { RecipeStatsSummary } from "./recipe-stats-summary";

function PublicRecipeHero({ heroImageId, title }: { heroImageId: string | null; title: string }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-100 bg-zinc-50 shadow-sm">
      {heroImageId
        ? <div className="p-4 text-sm text-zinc-600">Hero image: {heroImageId}</div>
        : <div className="flex h-32 items-center justify-center px-4 text-sm text-zinc-400">Изображение для «{title}» пока не добавлено.</div>}
    </section>
  );
}

export function PublicRecipePage({ recipe }: { recipe: RecipeDetailDto }) {
  return (
    <main className="space-y-4">
      <PublicRecipeHeader recipe={recipe} />
      <PublicRecipeHero heroImageId={recipe.heroImageId} title={recipe.title} />
      <RecipeStatsSummary recipe={recipe} />
      <RecipeIngredientsSection ingredients={recipe.ingredients} />
      <RecipeMetaSection recipe={recipe} showPrivateNotes={false} />
    </main>
  );
}
