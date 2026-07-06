import React from "react";
import Link from "next/link";

import type { PublicRecipeListItem } from "@/features/recipes/contracts";
import { formatAbvShort, formatIbuShort } from "@/features/recipes/format";
import { formatGravity, type PreferredGravityUnit } from "@/features/system/gravity-units";

import { CloneFromPublicButton } from "./clone-from-public-button";
import {
  AuthorAvatar,
  ColorStatCell,
  FeaturedBadge,
  RecipeRatingOrNew,
  RecipeThumb,
  StatCell,
  StyleChip
} from "./recipe-card-parts";
import { RecipeMatchBadge } from "./recipe-match-badge";
import { RecipeSaveButton } from "./recipe-save-button";

/**
 * Строка публичного рецепта для list-вида витрины `/recipes` — горизонтальная,
 * компактная раскладка под сравнение чисел и высокую плотность: миниатюра →
 * название/стиль/автор → статы ABV/IBU/OG/цвет + рейтинг фиксированными колонками.
 * Тот же stretched-link паттерн, что и в {@link RecipeCard}.
 *
 * Статы даны в двух раскладках: на `<md` — компактной строкой под названием (иначе
 * список на телефоне терял все числа и был беднее сетки), на `≥md` — рядом ячеек
 * фиксированной ширины со всегда зарезервированным слотом рейтинга, чтобы столбцы
 * ABV/IBU/OG/цвет выстраивались между строками (вид ведь «для сравнения чисел»).
 * Цвет показан так же, как в сетке (точка оттенка + SRM), а не текстовым пиллом —
 * чтобы представление параметра между видами не расходилось.
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
    <article className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-border bg-card p-2 pr-12 shadow-sm transition hover:border-border/70 hover:shadow-md">
      <Link
        href={`/recipes/${recipe.slug}`}
        aria-label={recipe.name}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />

      {/* Вариант B: миниатюра растёт (w-16 → w-32) и фото стиля резчеет на ховере;
          на тач остаётся статичной. Метку цвета на ней не рисуем — цвет показан
          стат-ячейкой (SRM), как в сетке. Базовый размер маленький — список плотнее сетки. */}
      <RecipeThumb
        heroImage={recipe.heroImage}
        styleImageUrl={recipe.styleImageUrl}
        colorSrm={recipe.colorSrm}
        sharpenStyleOnHover
        showColorMarker={false}
        className="aspect-[4/3] w-16 shrink-0 rounded-lg transition-all duration-300 sm:w-20 [@media(hover:hover)]:group-hover:w-32"
        sizes="(max-width: 640px) 90px, 130px"
      />

      <div className="pointer-events-none min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {recipe.featured ? <FeaturedBadge /> : null}
          <StyleChip style={recipe.style} styleHref={recipe.styleHref} />
        </div>
        <h2 className="mt-1 line-clamp-2 text-base font-semibold leading-snug text-foreground group-hover:text-muted-foreground">
          {recipe.name}
        </h2>
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="flex min-w-0 items-center gap-2">
            <AuthorAvatar image={recipe.author.image} displayName={recipe.author.displayName} />
            <span className="truncate text-xs text-muted-foreground">{authorName}</span>
          </span>
          <RecipeMatchBadge recipeId={recipe.id} />
        </div>

        {/* `<md`: статы компактной строкой под названием — на телефоне/узком планшете
            список иначе оставался без ABV/IBU/OG/цвета и рейтинга. */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 md:hidden">
          <StatCell label="ABV" value={formatAbvShort(recipe.abv)} />
          <StatCell label="IBU" value={formatIbuShort(recipe.ibu)} />
          <StatCell label="OG" value={formatGravity(recipe.og, preferredGravityUnit)} />
          <ColorStatCell srm={recipe.colorSrm} />
          <RecipeRatingOrNew rating={recipe.rating} createdAt={recipe.createdAt} />
        </div>
      </div>

      {/* `≥md`: колонки статов фиксированной ширины + всегда зарезервированный слот
          рейтинга (пустой, если оценок нет) — так ABV/IBU/OG/цвет выстраиваются
          вертикально между строками, и вид реально работает «для сравнения чисел». */}
      <div className="pointer-events-none hidden shrink-0 items-center gap-x-4 md:flex">
        <StatCell className="w-12 text-right" label="ABV" value={formatAbvShort(recipe.abv)} />
        <StatCell className="w-12 text-right" label="IBU" value={formatIbuShort(recipe.ibu)} />
        <StatCell className="w-16 text-right" label="OG" value={formatGravity(recipe.og, preferredGravityUnit)} />
        <ColorStatCell className="w-16 text-right" align="end" srm={recipe.colorSrm} />
        <div className="flex w-20 justify-end">
          <RecipeRatingOrNew rating={recipe.rating} createdAt={recipe.createdAt} />
        </div>
      </div>

      <RecipeSaveButton recipeId={recipe.id} slug={recipe.slug} />
      {showCloneAction ? <CloneFromPublicButton recipeId={recipe.id} slug={recipe.slug} variant="icon" /> : null}
    </article>
  );
}
