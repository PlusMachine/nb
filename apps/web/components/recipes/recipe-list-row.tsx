import React from "react";
import Link from "next/link";

import type { PublicRecipeListItem } from "@/features/recipes/contracts";
import { formatAbvShort, formatIbuShort, formatOgShort } from "@/features/recipes/format";

import { CloneFromPublicButton } from "./clone-from-public-button";
import {
  AuthorAvatar,
  ColorStatCell,
  RecipeRatingOrNew,
  RecipeThumb,
  StatCell,
  StyleChip
} from "./recipe-card-parts";
import { RecipeSaveButton } from "./recipe-save-button";

/**
 * Строка публичного рецепта для list-вида витрины `/recipes` — горизонтальная
 * раскладка под сравнение чисел: миниатюра → название/стиль/автор → выровненные
 * колонки ABV/IBU/OG/Цвет + рейтинг. Тот же stretched-link паттерн, что и в
 * {@link RecipeCard}. Числовые колонки скрыты на узких экранах (`<sm`), где строка
 * сворачивается в компактный вид.
 */
export function RecipeListRow({
  recipe,
  showCloneAction = false
}: {
  recipe: PublicRecipeListItem;
  showCloneAction?: boolean;
}) {
  const authorName = recipe.author.displayName ?? "Автор";

  return (
    <article className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-3 pr-12 shadow-sm transition hover:border-zinc-300 hover:shadow-md">
      <Link
        href={`/recipes/${recipe.slug}`}
        aria-label={recipe.name}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-500"
      />

      <RecipeThumb recipe={recipe} className="aspect-[4/3] w-24 shrink-0 rounded-lg sm:w-28" sizes="120px" />

      <div className="pointer-events-none min-w-0 flex-1">
        <StyleChip style={recipe.style} styleHref={recipe.styleHref} />
        <h2 className="mt-1 line-clamp-1 text-base font-semibold leading-snug text-zinc-950 group-hover:text-zinc-700">
          {recipe.name}
        </h2>
        <div className="mt-1.5 flex min-w-0 items-center gap-2">
          <AuthorAvatar image={recipe.author.image} displayName={recipe.author.displayName} />
          <span className="truncate text-xs text-zinc-600">{authorName}</span>
        </div>
      </div>

      <div className="pointer-events-none hidden shrink-0 items-center gap-5 sm:flex">
        <StatCell label="ABV" value={formatAbvShort(recipe.abv)} />
        <StatCell label="IBU" value={formatIbuShort(recipe.ibu)} />
        <StatCell label="OG" value={formatOgShort(recipe.og)} />
        <ColorStatCell srm={recipe.colorSrm} />
        <div className="min-w-[3.5rem] text-right">
          <RecipeRatingOrNew rating={recipe.rating} createdAt={recipe.createdAt} />
        </div>
      </div>

      <RecipeSaveButton recipeId={recipe.id} slug={recipe.slug} />
      {showCloneAction ? <CloneFromPublicButton recipeId={recipe.id} slug={recipe.slug} variant="icon" /> : null}
    </article>
  );
}
