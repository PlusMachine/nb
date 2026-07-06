"use client";

import React from "react";
import Link from "next/link";
import { CircleCheck, ExternalLink, X } from "lucide-react";

import {
  recipePublicationStateLabels,
  type OwnerRecipeCardDto,
  type RecipePublicationState
} from "@/features/recipes/contracts";
import { formatAbvShort, formatIbuShort, formatRelativeTimestamp } from "@/features/recipes/format";
import { formatGravity, type PreferredGravityUnit } from "@/features/system/gravity-units";

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

// Относительное время («2 часа назад») зависит от текущего момента: сервер (SSR)
// и клиент (гидрация) считают его в разные мгновения → hydration mismatch и
// мерцание карточек (#22). Считаем на сервере для первого кадра, после монтирования
// пересчитываем от клиентского времени; suppressHydrationWarning гасит расхождение.
function UpdatedAgo({ value, className }: { value: Date; className?: string }) {
  const [label, setLabel] = React.useState(() => formatRelativeTimestamp(value));
  React.useEffect(() => {
    setLabel(formatRelativeTimestamp(value));
  }, [value]);
  return (
    <span className={className} suppressHydrationWarning>
      обновлён {label}
    </span>
  );
}

function OwnerStatusBadge({ state }: { state: RecipePublicationState }) {
  const published = state === "published";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium backdrop-blur ${
        published ? "bg-primary/90 text-primary-foreground" : "bg-card/85 text-foreground ring-1 ring-black/5"
      }`}
    >
      {recipePublicationStateLabels[state]}
    </span>
  );
}

function StyleFitBadge({ fit }: { fit: "in_style" | "deviations" }) {
  const ok = fit === "in_style";
  // «Вне стиля» — факт, не ошибка: нейтральный серый и без тревожной иконки, чтобы
  // не читалось как предупреждение. «В стиле» остаётся позитивным (зелёный + галочка).
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
        ok ? "bg-success-subtle text-success-subtle-foreground ring-success/30" : "bg-muted text-muted-foreground ring-border"
      }`}
    >
      {ok ? <CircleCheck className="h-3 w-3" aria-hidden /> : null}
      {ok ? "В стиле" : "Вне стиля"}
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
          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-card/85 text-muted-foreground shadow-sm ring-1 ring-black/5 backdrop-blur transition-colors hover:bg-destructive-subtle hover:text-destructive disabled:opacity-60"
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
  return <span className="ml-1.5 text-sm font-normal text-muted-foreground">v{recipe.versionNumber}</span>;
}

/** Grid-карточка владельца. */
export function OwnerRecipeCard({
  recipe,
  preferredGravityUnit,
  showDelete = true
}: {
  recipe: OwnerRecipeCardDto;
  preferredGravityUnit: PreferredGravityUnit;
  showDelete?: boolean;
}) {
  const editHref = `/app/recipes/${recipe.id}/edit`;
  const publicPage = publicHref(recipe);

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:border-border hover:shadow-md">
      <Link
        href={editHref}
        aria-label={recipe.title}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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

          <h2 className="line-clamp-2 text-base font-semibold leading-snug text-foreground group-hover:text-muted-foreground">
            {recipe.title}
            <VersionSuffix recipe={recipe} />
          </h2>

          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
            <UpdatedAgo value={recipe.updatedAt} className="truncate text-xs text-muted-foreground" />
            <div className="flex items-center gap-1.5">
              <RecipeMatchBadge recipeId={recipe.id} />
              {recipe.styleFit ? <StyleFitBadge fit={recipe.styleFit} /> : null}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 border-t border-border pt-3">
            <StatCell label="ABV" value={formatAbvShort(recipe.abv)} />
            <StatCell label="IBU" value={formatIbuShort(recipe.ibu)} />
            <StatCell label="OG" value={formatGravity(recipe.og, preferredGravityUnit)} />
            <ColorStatCell srm={recipe.colorSrm} />
          </div>

          {publicPage ? (
            <Link
              href={publicPage}
              onClick={(event) => event.stopPropagation()}
              className="pointer-events-auto relative z-10 inline-flex w-fit items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
              Публичная страница
            </Link>
          ) : null}
        </div>
      </div>

      {showDelete ? (
        <div className="pointer-events-auto absolute right-2.5 top-2.5 z-10">
          <OwnerDeleteAction recipeId={recipe.id} title={recipe.title} />
        </div>
      ) : null}
    </article>
  );
}

/** List-строка владельца (горизонтальная, числа в колонках на ≥sm). */
export function OwnerRecipeRow({ recipe, preferredGravityUnit }: { recipe: OwnerRecipeCardDto; preferredGravityUnit: PreferredGravityUnit }) {
  const editHref = `/app/recipes/${recipe.id}/edit`;
  const publicPage = publicHref(recipe);

  return (
    <article className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border bg-card p-3 pr-14 shadow-sm transition hover:border-border hover:shadow-md">
      <Link
        href={editHref}
        aria-label={recipe.title}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
        <h2 className="mt-1 line-clamp-1 text-base font-semibold leading-snug text-foreground group-hover:text-muted-foreground">
          {recipe.title}
          <VersionSuffix recipe={recipe} />
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <UpdatedAgo value={recipe.updatedAt} />
          <RecipeMatchBadge recipeId={recipe.id} />
          {recipe.styleFit ? <StyleFitBadge fit={recipe.styleFit} /> : null}
          {publicPage ? (
            <Link
              href={publicPage}
              onClick={(event) => event.stopPropagation()}
              className="pointer-events-auto relative z-10 inline-flex items-center gap-1 font-medium text-primary transition-colors hover:text-primary/80"
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
        <StatCell label="OG" value={formatGravity(recipe.og, preferredGravityUnit)} />
        <ColorStatCell srm={recipe.colorSrm} />
      </div>

      <div className="pointer-events-auto absolute right-3 top-1/2 z-10 -translate-y-1/2">
        <OwnerDeleteAction recipeId={recipe.id} title={recipe.title} />
      </div>
    </article>
  );
}
