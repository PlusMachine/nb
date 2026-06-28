"use client";

import React from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, ExternalLink, X } from "lucide-react";

import {
  recipePublicationStateLabels,
  type OwnerRecipeCardDto,
  type RecipePublicationState
} from "@/features/recipes/contracts";
import { formatAbvShort, formatIbuShort, formatOgShort, formatRelativeTimestamp } from "@/features/recipes/format";

import { ColorStatCell, StatCell, StyleChip, RecipeThumb } from "./recipe-card-parts";
import { DeleteRecipeButton } from "./delete-recipe-button";
import { RecipeMatchBadge } from "./recipe-match-badge";

/**
 * Карточка и строка рецепта владельца для галереи `/app/recipes`. Делят визуальный
 * язык с витриной `/recipes` ({@link RecipeCard}/{@link RecipeListRow}): обложка по
 * SRM/стилю/фото, чип стиля, компактные числовые ячейки + stretched-link. Отличия —
 * владельческие: клик ведёт в редактор, поверх обложки бейдж статуса публикации и
 * иконка «Удалить», под статами — ссылка на публичную страницу.
 */

function OwnerStatusBadge({ state }: { state: RecipePublicationState }) {
  const published = state === "published";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium backdrop-blur ${
        published ? "bg-emerald-600/90 text-white" : "bg-white/85 text-zinc-700 ring-1 ring-black/5"
      }`}
    >
      {recipePublicationStateLabels[state]}
    </span>
  );
}

function StyleFitBadge({ fit }: { fit: "in_style" | "deviations" }) {
  const ok = fit === "in_style";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        ok ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
      }`}
    >
      {ok ? <CircleCheck className="h-3 w-3" aria-hidden /> : <CircleAlert className="h-3 w-3" aria-hidden />}
      {ok ? "В стиле" : "Отклонения"}
    </span>
  );
}

/** Иконка-оверлей «Удалить» (с подтверждением внутри {@link DeleteRecipeButton}). */
function OwnerDeleteAction({ recipeId, title }: { recipeId: string; title: string }) {
  return (
    <DeleteRecipeButton
      recipeId={recipeId}
      title={title}
      renderTrigger={(onClick, isPending) => (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
          disabled={isPending}
          aria-label="Удалить рецепт"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/85 text-zinc-500 shadow-sm ring-1 ring-black/5 backdrop-blur transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    />
  );
}

const toStyleChip = (recipe: OwnerRecipeCardDto) =>
  recipe.styleCode && recipe.styleName ? { code: recipe.styleCode, name: recipe.styleName } : null;

const publicHref = (recipe: OwnerRecipeCardDto) =>
  recipe.publicationState === "published" ? `/recipes/${recipe.slug}` : null;

function VersionSuffix({ recipe }: { recipe: OwnerRecipeCardDto }) {
  if (recipe.versionCount <= 1) {
    return null;
  }
  return <span className="ml-1.5 text-sm font-normal text-zinc-400">v{recipe.versionNumber}</span>;
}

/** Grid-карточка владельца. */
export function OwnerRecipeCard({ recipe }: { recipe: OwnerRecipeCardDto }) {
  const editHref = `/app/recipes/${recipe.id}/edit`;
  const publicPage = publicHref(recipe);

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:border-zinc-300 hover:shadow-md">
      <Link
        href={editHref}
        aria-label={recipe.title}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-500"
      />

      <div className="pointer-events-none flex h-full flex-col">
        <div className="relative">
          <RecipeThumb
            heroImage={recipe.heroImage}
            styleImageUrl={recipe.styleImageUrl}
            colorSrm={recipe.colorSrm}
            className="aspect-[4/3] w-full"
            sizes="(max-width: 768px) 100vw, 320px"
          />
          <div className="absolute left-2.5 top-2.5">
            <OwnerStatusBadge state={recipe.publicationState} />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          <StyleChip style={toStyleChip(recipe)} styleHref={recipe.styleHref} />

          <h2 className="line-clamp-2 text-base font-semibold leading-snug text-zinc-950 group-hover:text-zinc-700">
            {recipe.title}
            <VersionSuffix recipe={recipe} />
          </h2>

          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="truncate text-xs text-zinc-500">обновлён {formatRelativeTimestamp(recipe.updatedAt)}</span>
            <div className="flex items-center gap-1.5">
              <RecipeMatchBadge recipeId={recipe.id} />
              {recipe.styleFit ? <StyleFitBadge fit={recipe.styleFit} /> : null}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 border-t border-zinc-100 pt-3">
            <StatCell label="ABV" value={formatAbvShort(recipe.abv)} />
            <StatCell label="IBU" value={formatIbuShort(recipe.ibu)} />
            <StatCell label="OG" value={formatOgShort(recipe.og)} />
            <ColorStatCell srm={recipe.colorSrm} />
          </div>

          {publicPage ? (
            <Link
              href={publicPage}
              onClick={(event) => event.stopPropagation()}
              className="pointer-events-auto relative z-10 inline-flex w-fit items-center gap-1 text-xs font-medium text-emerald-700 transition-colors hover:text-emerald-900"
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
              Публичная страница
            </Link>
          ) : null}
        </div>
      </div>

      <div className="pointer-events-auto absolute right-2.5 top-2.5 z-10">
        <OwnerDeleteAction recipeId={recipe.id} title={recipe.title} />
      </div>
    </article>
  );
}

/** List-строка владельца (горизонтальная, числа в колонках на ≥sm). */
export function OwnerRecipeRow({ recipe }: { recipe: OwnerRecipeCardDto }) {
  const editHref = `/app/recipes/${recipe.id}/edit`;
  const publicPage = publicHref(recipe);

  return (
    <article className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-3 pr-14 shadow-sm transition hover:border-zinc-300 hover:shadow-md">
      <Link
        href={editHref}
        aria-label={recipe.title}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-500"
      />

      <RecipeThumb
        heroImage={recipe.heroImage}
        styleImageUrl={recipe.styleImageUrl}
        colorSrm={recipe.colorSrm}
        className="aspect-[4/3] w-24 shrink-0 rounded-lg sm:w-28"
        sizes="120px"
      />

      <div className="pointer-events-none min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <OwnerStatusBadge state={recipe.publicationState} />
          <StyleChip style={toStyleChip(recipe)} styleHref={recipe.styleHref} />
        </div>
        <h2 className="mt-1 line-clamp-1 text-base font-semibold leading-snug text-zinc-950 group-hover:text-zinc-700">
          {recipe.title}
          <VersionSuffix recipe={recipe} />
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span>обновлён {formatRelativeTimestamp(recipe.updatedAt)}</span>
          <RecipeMatchBadge recipeId={recipe.id} />
          {recipe.styleFit ? <StyleFitBadge fit={recipe.styleFit} /> : null}
          {publicPage ? (
            <Link
              href={publicPage}
              onClick={(event) => event.stopPropagation()}
              className="pointer-events-auto relative z-10 inline-flex items-center gap-1 font-medium text-emerald-700 transition-colors hover:text-emerald-900"
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
              Публичная страница
            </Link>
          ) : null}
        </div>
      </div>

      <div className="pointer-events-none hidden shrink-0 items-center gap-5 sm:flex">
        <StatCell label="ABV" value={formatAbvShort(recipe.abv)} />
        <StatCell label="IBU" value={formatIbuShort(recipe.ibu)} />
        <StatCell label="OG" value={formatOgShort(recipe.og)} />
        <ColorStatCell srm={recipe.colorSrm} />
      </div>

      <div className="pointer-events-auto absolute right-3 top-1/2 z-10 -translate-y-1/2">
        <OwnerDeleteAction recipeId={recipe.id} title={recipe.title} />
      </div>
    </article>
  );
}
