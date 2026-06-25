import React from "react";
import { Star } from "lucide-react";

import type { RecipeDetailDto } from "@/features/recipes/contracts";

import { PublicRecipeHeader } from "./public-recipe-header";
import { RecipeRatingForm } from "./recipe-rating-form";
import { PublicRecipeWaterSection } from "./public-recipe-water-section";
import { RecipeIngredientsSection } from "./recipe-ingredients-section";
import { RecipeMetaSection } from "./recipe-meta-section";
import { RecipeStatsSummary } from "./recipe-stats-summary";

const ratingFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

function PublicRecipeHero({ heroImageId, title }: { heroImageId: string | null; title: string }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-100 bg-zinc-50 shadow-sm">
      {heroImageId
        ? <div className="p-4 text-sm text-zinc-600">Hero image: {heroImageId}</div>
        : <div className="flex h-32 items-center justify-center px-4 text-sm text-zinc-400">Изображение для «{title}» пока не добавлено.</div>}
    </section>
  );
}

function RecipeRatingSection({ recipe }: { recipe: RecipeDetailDto }) {
  return (
    <section className="space-y-4 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-900">Оценки</h2>
        {recipe.rating ? (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-600">
            <Star className="h-4 w-4 fill-amber-500 text-amber-500" aria-hidden />
            {ratingFormatter.format(recipe.rating.average)}
            <span className="text-zinc-400">({recipe.rating.count})</span>
          </span>
        ) : (
          <span className="text-sm text-zinc-500">Оценок пока нет</span>
        )}
      </div>
      {/* Персональное состояние формы тянется клиентом после гидрации → документ кэшируем. */}
      <RecipeRatingForm recipeId={recipe.id} slug={recipe.slug} />
    </section>
  );
}

export function PublicRecipePage({ recipe }: { recipe: RecipeDetailDto }) {
  return (
    <main className="space-y-4">
      <PublicRecipeHeader recipe={recipe} />
      <PublicRecipeHero heroImageId={recipe.heroImageId} title={recipe.title} />
      <RecipeStatsSummary recipe={recipe} />
      <RecipeRatingSection recipe={recipe} />
      <RecipeIngredientsSection ingredients={recipe.ingredients} />
      <PublicRecipeWaterSection recipe={recipe} />
      <RecipeMetaSection recipe={recipe} showPrivateNotes={false} />
    </main>
  );
}
