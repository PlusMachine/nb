import React from "react";
import Link from "next/link";

import type { PublicRecipeListItem } from "@/features/recipes/contracts";
import { formatAbvShort, formatBatchVolume, formatIbuShort, formatOgShort } from "@/features/recipes/format";

import { CloneFromPublicButton } from "./clone-from-public-button";
import { AuthorAvatar, RecipeRatingOrNew, RecipeThumb, StatCell, StyleChip } from "./recipe-card-parts";
import { RecipeMatchBadge } from "./recipe-match-badge";
import { RecipeSaveButton } from "./recipe-save-button";

/**
 * Карточка публичного рецепта (§6 ТЗ) — серверный компонент, без доменной логики:
 * все данные берутся из {@link PublicRecipeListItem}.
 *
 * Stretched-link: вся карточка — кликабельная ссылка на `/recipes/[slug]`, но
 * вложенные интерактивные элементы (чип стиля → BJCP, «Сохранить», «Клонировать»)
 * лежат выше по z-слою и перехватывают свои клики. Контент обёрнут в
 * `pointer-events-none`, чтобы клики по тексту/обложке проходили к растянутой
 * ссылке; интерактивные дети возвращают себе `pointer-events-auto`.
 */
export function RecipeCard({
  recipe,
  showCloneAction = false
}: {
  recipe: PublicRecipeListItem;
  showCloneAction?: boolean;
}) {
  const authorName = recipe.author.displayName ?? "Автор";

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:border-zinc-300 hover:shadow-md">
      <Link
        href={`/recipes/${recipe.slug}`}
        aria-label={recipe.name}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-500"
      />

      <div className="pointer-events-none flex h-full flex-col">
        {/* Обложка: фото рецепта → размытое фото BJCP-стиля → мягкая заливка по SRM */}
        <RecipeThumb
          heroImage={recipe.heroImage}
          styleImageUrl={recipe.styleImageUrl}
          colorSrm={recipe.colorSrm}
          className="aspect-[4/3] w-full"
          sizes="(max-width: 768px) 100vw, 320px"
        />

        <div className="flex flex-1 flex-col gap-2 p-4">
          <StyleChip style={recipe.style} styleHref={recipe.styleHref} />

          <h2 className="line-clamp-2 text-base font-semibold leading-snug text-zinc-950 group-hover:text-zinc-700">
            {recipe.name}
          </h2>

          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            <div className="flex min-w-0 items-center gap-2">
              <AuthorAvatar image={recipe.author.image} displayName={recipe.author.displayName} />
              <span className="truncate text-xs text-zinc-600">{authorName}</span>
            </div>
            <RecipeRatingOrNew rating={recipe.rating} createdAt={recipe.createdAt} />
          </div>

          <div className="grid grid-cols-4 gap-2 border-t border-zinc-100 pt-3">
            <StatCell label="ABV" value={formatAbvShort(recipe.abv)} />
            <StatCell label="IBU" value={formatIbuShort(recipe.ibu)} />
            <StatCell label="OG" value={formatOgShort(recipe.og)} />
            <StatCell label="Объём" value={formatBatchVolume(recipe.batchSizeL)} />
          </div>
        </div>
      </div>

      {/* Бейдж «можно сварить» — поверх обложки слева (save-флажок справа). */}
      <RecipeMatchBadge recipeId={recipe.id} className="absolute left-2 top-2 z-10" />

      {/* Флажок «Сохранить» — сиблинг ссылки (нельзя вкладывать кнопку в <a>),
          абсолютно поверх обложки (z-10 в самом компоненте). */}
      <RecipeSaveButton recipeId={recipe.id} slug={recipe.slug} />
      {/* Мост «Клонировать» — только там, где это уместно (напр. /app/saved). */}
      {showCloneAction ? <CloneFromPublicButton recipeId={recipe.id} slug={recipe.slug} variant="icon" /> : null}
    </article>
  );
}
