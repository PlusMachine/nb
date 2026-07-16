import React from "react";
import Link from "next/link";
import { Star } from "lucide-react";

import type { PublicRecipeListItem, RecipeDetailDto } from "@/features/recipes/contracts";

import { PublicRecipeHeader } from "./public-recipe-header";
import { RecipeColorBand } from "./recipe-color-band";
import { SimilarRecipesSection } from "./similar-recipes-section";
import { RecipePhotoHero } from "./recipe-photo-hero";
import { RecipeCloneAttribution } from "./recipe-clone-attribution";
import { RecipeSourceAttribution } from "./recipe-source-attribution";
import { RecipeRatingForm } from "./recipe-rating-form";
import { RecipeFeatureToggle } from "./recipe-feature-toggle";
import { RecipeMatchPanel } from "./recipe-match-panel";
import { RecipeMatchMobileBadge } from "./recipe-match-mobile-badge";
import { RecipeMatchProvider } from "./recipe-match-context";
import { RecipeScalePanel } from "./recipe-scale-panel";
import { PublicRecipeWaterSection } from "./public-recipe-water-section";
import {
  PublicRecipeBoilSection,
  PublicRecipeFermentationSection,
  PublicRecipeMashSection
} from "./public-recipe-process-section";
import { RecipeIngredientsSection } from "./recipe-ingredients-section";
import { RecipeMetaSection } from "./recipe-meta-section";
import { RecipeStatsSummaryViewer } from "./recipe-stats-summary-viewer";

const ratingFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

function RecipeRatingSection({ recipe }: { recipe: RecipeDetailDto }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">Оценки</h2>
        {recipe.rating ? (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-warning-subtle-foreground">
            <Star className="h-4 w-4 fill-amber-500 text-amber-500" aria-hidden />
            {ratingFormatter.format(recipe.rating.average)}
            <span className="text-muted-foreground">({recipe.rating.count})</span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Оценок пока нет</span>
        )}
      </div>
      {/* Персональное состояние формы тянется клиентом после гидрации → документ кэшируем. */}
      <RecipeRatingForm recipeId={recipe.id} slug={recipe.slug} />
    </section>
  );
}

export function PublicRecipePage({
  recipe,
  similarRecipes = []
}: {
  recipe: RecipeDetailDto;
  similarRecipes?: PublicRecipeListItem[];
}) {
  return (
    <RecipeMatchProvider recipeId={recipe.id}>
      <main className="relative space-y-6 pt-6">
        <RecipeColorBand colorSrm={recipe.color} />
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-2">
            <li><Link href="/" className="transition hover:text-foreground">Главная</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link href="/recipes" className="transition hover:text-foreground">Рецепты</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-foreground">{recipe.title}</li>
          </ol>
        </nav>

        <PublicRecipeHeader recipe={recipe} />

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Цифры — сразу под шапкой (быстрый ответ «что за пиво»), дальше суть
              рецепта в порядке варки: обложка → описание → ингредиенты → вода →
              затирание → кипячение → брожение. Затор/брожение — read-only, только
              если в рецепте есть данные (ответ на «хватит ли, чтобы сварить» без клона). */}
          <div className="min-w-0 space-y-6">
            <RecipeStatsSummaryViewer recipe={recipe} />
            {/* П1: на <lg панель матча падает в самый низ страницы — вердикт
                виден без прокрутки через весь рецепт, тап скроллит к панели. */}
            <RecipeMatchMobileBadge />
            {recipe.heroImageId ? <RecipePhotoHero imageId={recipe.heroImageId} title={recipe.title} /> : null}
            <RecipeMetaSection recipe={recipe} showPrivateNotes={false} />
            <RecipeIngredientsSection ingredients={recipe.ingredients} />
            <PublicRecipeWaterSection recipe={recipe} />
            <PublicRecipeMashSection processMeta={recipe.processMeta} />
            <PublicRecipeBoilSection boilTimeMinutes={recipe.boilTimeMinutes} ingredients={recipe.ingredients} />
            <PublicRecipeFermentationSection processMeta={recipe.processMeta} ingredients={recipe.ingredients} />
          </div>

          {/* Инструменты и провенанс — не мешают чтению рецепта, доступны в один клик. */}
          <aside className="space-y-4 lg:sticky lg:top-[calc(var(--chrome-top)+1.5rem)]">
            {/* Кураторский тумблер «Выбор редакции» — грузит права/состояние клиентом
                после гидрации; обычному пользователю не рендерится. */}
            <RecipeFeatureToggle recipeId={recipe.id} slug={recipe.slug} />
            {/* Персональный матчинг со складом тянется клиентом после гидрации → документ кэшируем. */}
            <RecipeMatchPanel />
            {/* Эфемерный пересчёт под объём — модалка, чистый клиент, без записи в БД. */}
            <RecipeScalePanel recipe={recipe} />
            <RecipeCloneAttribution clonedFrom={recipe.clonedFrom} ownerAuthorId={recipe.authorId} />
            <RecipeSourceAttribution importMeta={recipe.importMeta} />
          </aside>
        </div>

        <RecipeRatingSection recipe={recipe} />
        <SimilarRecipesSection recipes={similarRecipes} />
      </main>
    </RecipeMatchProvider>
  );
}
