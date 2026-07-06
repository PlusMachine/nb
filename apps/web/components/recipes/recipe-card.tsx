import React from "react";
import Link from "next/link";

import type { PublicRecipeListItem } from "@/features/recipes/contracts";
import { formatAbvShort, formatBatchVolume, formatIbuShort } from "@/features/recipes/format";
import { formatGravity, type PreferredGravityUnit } from "@/features/system/gravity-units";

import { CloneFromPublicButton } from "./clone-from-public-button";
import { AuthorAvatar, ColorStatCell, FeaturedBadge, RecipeRatingOrNew, RecipeThumb, StatCell, StyleChip } from "./recipe-card-parts";
import { RecipeMatchBadge } from "./recipe-match-badge";
import { RecipeSaveButton } from "./recipe-save-button";

/**
 * Карточка публичного рецепта (§6 ТЗ) — серверный компонент, без доменной логики:
 * все данные берутся из {@link PublicRecipeListItem}.
 *
 * Компактная раскладка: маленькая миниатюра (64×64) слева, акцент — на названии
 * и параметрах справа (картинка — не «герой» карточки, а фото BJCP-стиля почти
 * всегда одно на весь стиль, так что не стоит превращать его в главный элемент).
 * Чип стиля/рейтинг/match-бейдж — в одной flex-wrap строке (не жёсткие колонки):
 * на узких карточках (сайдбар фильтров съедает ширину сетки) им втроём может не
 * хватить строки, и перенос на вторую строку безопаснее, чем обрезка чипа до
 * одной буквы или бейдж, вылезающий за край. `pr-8` в этой строке резервирует
 * место под «Сохранить»/«Клонировать» — те абсолютно спозиционированы в правом
 * верхнем углу карточки независимо от паддинга контента.
 *
 * Stretched-link: вся карточка — кликабельная ссылка на `/recipes/[slug]`, но
 * вложенные интерактивные элементы (чип стиля → BJCP, «Сохранить», «Клонировать»)
 * лежат выше по z-слою и перехватывают свои клики. Контент обёрнут в
 * `pointer-events-none`, чтобы клики по тексту/обложке проходили к растянутой
 * ссылке; интерактивные дети возвращают себе `pointer-events-auto`.
 */
export function RecipeCard({
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
    <article className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-border hover:shadow-md">
      <Link
        href={`/recipes/${recipe.slug}`}
        aria-label={recipe.name}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />

      <div className="pointer-events-none flex h-full flex-col gap-3">
        <div className="flex items-start gap-3">
          {/* Обложка: фото рецепта (резко) → фото BJCP-стиля (лёгкий блюр) → заливка по SRM */}
          <RecipeThumb
            heroImage={recipe.heroImage}
            styleImageUrl={recipe.styleImageUrl}
            colorSrm={recipe.colorSrm}
            showColorMarker={false}
            className="h-16 w-16 shrink-0 rounded-xl ring-1 ring-inset ring-black/5"
            sizes="64px"
          />
          <div className="min-w-0 flex-1 space-y-1">
            {/* flex-wrap, а не «чип слева / бейджи справа фиксированной колонкой»: на узких
                карточках (сайдбар фильтров съедает ширину сетки) чип стиля + рейтинг +
                match-бейдж вместе не влезают в одну строку — раньше это либо резало чип
                до одной буквы, либо выталкивало бейдж за край карточки. */}
            <div className="flex flex-wrap items-center gap-1.5 pr-8">
              {recipe.featured ? <FeaturedBadge /> : null}
              <StyleChip style={recipe.style} styleHref={recipe.styleHref} className="min-w-0 truncate" />
              <span className="shrink-0">
                <RecipeRatingOrNew rating={recipe.rating} createdAt={recipe.createdAt} />
              </span>
              <RecipeMatchBadge recipeId={recipe.id} />
            </div>
            {/* Название — до 2 строк, чтобы длинные имена не растягивали шапку сверх меры. */}
            <h2 className="line-clamp-2 text-base font-semibold leading-snug text-foreground group-hover:text-foreground/80">
              {recipe.name}
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 rounded-xl bg-muted p-2.5">
          <StatCell label="ABV" value={formatAbvShort(recipe.abv)} />
          <StatCell label="IBU" value={formatIbuShort(recipe.ibu)} />
          <StatCell label="OG" value={formatGravity(recipe.og, preferredGravityUnit)} />
          <ColorStatCell srm={recipe.colorSrm} />
        </div>

        <div className="mt-auto flex min-w-0 items-center justify-between gap-2 pt-1">
          <span className="flex min-w-0 items-center gap-2">
            <AuthorAvatar image={recipe.author.image} displayName={recipe.author.displayName} />
            <span className="truncate text-xs text-muted-foreground">{authorName}</span>
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{formatBatchVolume(recipe.batchSizeL)}</span>
        </div>
      </div>

      {/* Флажок «Сохранить» — сиблинг ссылки (нельзя вкладывать кнопку в <a>),
          абсолютно в правом верхнем углу (z-10 в самом компоненте). */}
      <RecipeSaveButton recipeId={recipe.id} slug={recipe.slug} />
      {/* Мост «Клонировать» — только там, где это уместно (напр. /app/saved). */}
      {showCloneAction ? <CloneFromPublicButton recipeId={recipe.id} slug={recipe.slug} variant="icon" /> : null}
    </article>
  );
}
