import React from "react";
import Link from "next/link";

import type { PublicRecipeListItem } from "@/features/recipes/contracts";
import { formatAbvShort, formatIbuShort } from "@/features/recipes/format";
import { formatGravity, type PreferredGravityUnit } from "@/features/system/gravity-units";

import { CloneFromPublicButton } from "./clone-from-public-button";
import {
  AuthorAvatar,
  ColorPip,
  RecipeRatingOrNew,
  RecipeThumb,
  StatCell,
  StyleChip
} from "./recipe-card-parts";
import { RecipeMatchBadge } from "./recipe-match-badge";
import { RecipeSaveButton } from "./recipe-save-button";

/**
 * Строка публичного рецепта для list-вида витрины `/recipes` — горизонтальная
 * раскладка под сравнение чисел: миниатюра → название/стиль/цвет/автор →
 * выровненные колонки ABV/IBU/OG + рейтинг. Тот же stretched-link паттерн, что и в
 * {@link RecipeCard}. Числовые колонки скрыты на узких экранах (`<sm`), где строка
 * сворачивается в компактный вид (цвет там — пиллом в тексте).
 *
 * Ховер-превью (вариант B): миниатюра плавно растёт и размытое фото стиля резчеет
 * на наведении мыши (`[@media(hover:hover)]`); на тач — статичная миниатюра.
 */
export function RecipeListRow({
  recipe,
  showCloneAction = false,
  preferredGravityUnit
}: {
  recipe: PublicRecipeListItem;
  showCloneAction?: boolean;
  preferredGravityUnit: PreferredGravityUnit;
}) {
  const authorName = recipe.author.displayName ?? "Автор";

  return (
    <article className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-3 pr-12 shadow-sm transition hover:border-zinc-300 hover:shadow-md">
      <Link
        href={`/recipes/${recipe.slug}`}
        aria-label={recipe.name}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-500"
      />

      {/* Вариант B: миниатюра растёт (w-24 → w-44) и фото стиля резчеет на ховере;
          на тач остаётся статичной. Метку цвета на ней не рисуем — она пиллом в тексте. */}
      <RecipeThumb
        heroImage={recipe.heroImage}
        styleImageUrl={recipe.styleImageUrl}
        colorSrm={recipe.colorSrm}
        sharpenStyleOnHover
        showColorMarker={false}
        className="aspect-[4/3] w-24 shrink-0 rounded-lg transition-all duration-300 sm:w-28 [@media(hover:hover)]:group-hover:w-44"
        sizes="(max-width: 640px) 120px, 200px"
      />

      <div className="pointer-events-none min-w-0 flex-1">
        <StyleChip style={recipe.style} styleHref={recipe.styleHref} />
        <h2 className="mt-1 line-clamp-2 text-base font-semibold leading-snug text-zinc-950 group-hover:text-zinc-700">
          {recipe.name}
        </h2>
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="flex min-w-0 items-center gap-2">
            <AuthorAvatar image={recipe.author.image} displayName={recipe.author.displayName} />
            <span className="truncate text-xs text-zinc-600">{authorName}</span>
          </span>
          <ColorPip srm={recipe.colorSrm} />
          <RecipeMatchBadge recipeId={recipe.id} />
        </div>
      </div>

      {/* 2×2, а не один ряд из 4: сайдбар фильтров съедает ширину сетки на части
          экранов (~1024–1100px), и широкий ряд статов выталкивал название почти
          в ничто. Компактный блок 2×2 занимает меньше горизонтали. */}
      <div className="pointer-events-none hidden shrink-0 grid-cols-2 gap-x-4 gap-y-1 sm:grid">
        <StatCell label="ABV" value={formatAbvShort(recipe.abv)} />
        <StatCell label="IBU" value={formatIbuShort(recipe.ibu)} />
        <StatCell label="OG" value={formatGravity(recipe.og, preferredGravityUnit)} />
        <div className="min-w-0 text-right">
          <RecipeRatingOrNew rating={recipe.rating} createdAt={recipe.createdAt} />
        </div>
      </div>

      <RecipeSaveButton recipeId={recipe.id} slug={recipe.slug} />
      {showCloneAction ? <CloneFromPublicButton recipeId={recipe.id} slug={recipe.slug} variant="icon" /> : null}
    </article>
  );
}
