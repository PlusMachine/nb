import React from "react";
import { Star } from "lucide-react";

import type { RecipeDetailDto } from "@/features/recipes/contracts";

import { PublicRecipeHeader } from "./public-recipe-header";
import { RecipePhotoHero } from "./recipe-photo-hero";
import { RecipeCloneAttribution } from "./recipe-clone-attribution";
import { RecipeSourceAttribution } from "./recipe-source-attribution";
import { RecipeRatingForm } from "./recipe-rating-form";
import { RecipeMatchPanel } from "./recipe-match-panel";
import { RecipeScalePanel } from "./recipe-scale-panel";
import { PublicRecipeWaterSection } from "./public-recipe-water-section";
import { RecipeIngredientsSection } from "./recipe-ingredients-section";
import { RecipeMetaSection } from "./recipe-meta-section";
import { RecipeStatsSummary } from "./recipe-stats-summary";

const ratingFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

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
    <main className="space-y-6 pt-6">
      <PublicRecipeHeader recipe={recipe} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Суть рецепта: обложка (если есть) → описание → цифры → ингредиенты → вода. */}
        <div className="min-w-0 space-y-6">
          {recipe.heroImageId ? <RecipePhotoHero imageId={recipe.heroImageId} title={recipe.title} /> : null}
          <RecipeMetaSection recipe={recipe} showPrivateNotes={false} />
          <RecipeStatsSummary recipe={recipe} />
          <RecipeIngredientsSection ingredients={recipe.ingredients} />
          <PublicRecipeWaterSection recipe={recipe} />
        </div>

        {/* Инструменты и провенанс — не мешают чтению рецепта, доступны в один клик. */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          {/* Персональный матчинг со складом тянется клиентом после гидрации → документ кэшируем. */}
          <RecipeMatchPanel recipeId={recipe.id} />
          {/* Эфемерный пересчёт под объём — модалка, чистый клиент, без записи в БД. */}
          <RecipeScalePanel recipe={recipe} />
          <RecipeCloneAttribution clonedFrom={recipe.clonedFrom} ownerAuthorId={recipe.authorId} />
          <RecipeSourceAttribution importMeta={recipe.importMeta} />
        </aside>
      </div>

      <RecipeRatingSection recipe={recipe} />
    </main>
  );
}
