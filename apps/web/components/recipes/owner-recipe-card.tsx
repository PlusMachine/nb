"use client";

import React from "react";
import Link from "next/link";
import { CircleCheck, ExternalLink, MoreVertical, Timer, Trash2 } from "lucide-react";

import { deleteRecipeAction } from "@/app/(app)/app/recipes/actions";
import { recipePublicationStateLabels, type OwnerRecipeCardDto } from "@/features/recipes/contracts";
import {
  buildRecipeDeleteConfirmDescription,
  formatAbvShort,
  formatIbuShort,
  formatRelativeTimestamp
} from "@/features/recipes/format";
import { formatGravity, type PreferredGravityUnit } from "@/features/system/gravity-units";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { DropdownMenu, type DropdownMenuItem } from "@nb/ui";

import { ColorStatCell, StatCell, StyleChip, RecipeThumb } from "./recipe-card-parts";
import { RecipeMatchBadge } from "./recipe-match-badge";

/**
 * Карточка и строка рецепта владельца для галереи `/app/recipes`. Делят визуальный
 * язык с витриной `/recipes` ({@link RecipeCard}/{@link RecipeListRow}): обложка по
 * SRM/стилю/фото, чип стиля, компактные числовые ячейки + stretched-link.
 *
 * Режим задаётся явным пропом `intent`:
 * - `"manage"` (по умолчанию) — stretched-элемент ведёт в редактор, под статами —
 *   ссылка на публичную страницу, поверх обложки — кнопка-меню действий («Удалить»,
 *   а если передан `onBrew` — ещё и «Сварить»).
 * - `"brew"` — режим выбора рецепта для варки: stretched-элемент становится кнопкой,
 *   вызывающей `onBrew`, аффорданс — «Сварить» с иконкой; меню действий и ссылка на
 *   публичную страницу скрыты.
 * - `"preview"` — обзорная карточка без владельческих действий (виджет дашборда,
 *   демо-выставка): stretched-элемент ведёт в редактор и ссылка на публичную
 *   страницу остаются как в `"manage"`, но меню действий не рендерится и
 *   `onBrew` игнорируется.
 */

export type OwnerRecipeCardIntent = "manage" | "brew" | "preview";

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

/**
 * Бейдж статуса: скрытие модератором — единственный негативный факт, который
 * автору нужно видеть сразу; в остальном подсвечиваем только «Публичный»,
 * черновик/приватность не выделяем.
 */
function OwnerStatusBadge({ recipe }: { recipe: OwnerRecipeCardDto }) {
  if (recipe.hiddenAt) {
    return (
      <span className="inline-flex items-center rounded-full bg-destructive-subtle px-2 py-0.5 text-[11px] font-medium text-destructive-subtle-foreground ring-1 ring-destructive-border">
        Скрыт модератором
      </span>
    );
  }
  if (recipe.publicationState !== "published") {
    return null;
  }
  return (
    <span className="inline-flex items-center rounded-full bg-primary/90 px-2 py-0.5 text-[11px] font-medium text-primary-foreground backdrop-blur">
      {recipePublicationStateLabels[recipe.publicationState]}
    </span>
  );
}

/** Причина скрытия — автор должен понимать, за что рецепт убрали с витрины. */
function HiddenReason({ recipe }: { recipe: OwnerRecipeCardDto }) {
  if (!recipe.hiddenAt || !recipe.hiddenReason) {
    return null;
  }
  return <p className="line-clamp-2 text-xs text-destructive-subtle-foreground">Причина: {recipe.hiddenReason}</p>;
}

/** Бейдж соответствия стилю — показываем только позитивный факт «В стиле», отклонения не подсвечиваем. */
function StyleFitBadge({ fit }: { fit: "in_style" | "deviations" }) {
  if (fit !== "in_style") {
    return null;
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-subtle px-2 py-0.5 text-[11px] font-medium text-success-subtle-foreground ring-1 ring-success/30">
      <CircleCheck className="h-3 w-3" aria-hidden />
      В стиле
    </span>
  );
}

/**
 * Диалог подтверждения удаления рецепта + состояние его открытости.
 *
 * Диалог нужно рендерить снаружи `DropdownMenuContent`: Radix размонтирует
 * содержимое меню при закрытии, и диалог, открытый из пункта меню, исчез бы
 * вместе с ним. Поэтому пункт меню только переключает состояние здесь, а сам
 * `<ConfirmActionDialog>` возвращается наружу и монтируется в карточке рядом
 * с остальной разметкой, а не внутри меню.
 */
function useDeleteRecipeDialog(recipe: OwnerRecipeCardDto) {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Явное состояние вместо useTransition: isPending из useTransition гаснет уже
  // на первом await внутри переданного колбэка (React 18), т.е. до ответа сервера —
  // кнопки диалога успевали разблокироваться и guard isDirty:()=>pending переставал
  // защищать от повторного клика «Удалить» раньше, чем запрос завершался.
  const [isPending, setIsPending] = React.useState(false);

  const requestDelete = React.useCallback(() => {
    setError(null);
    setOpen(true);
  }, []);

  const dialog = (
    <ConfirmActionDialog
      open={open}
      title="Удалить рецепт?"
      description={buildRecipeDeleteConfirmDescription(recipe.title, recipe.brewBatchCount)}
      confirmLabel="Удалить рецепт"
      pending={isPending}
      error={error}
      onClose={() => setOpen(false)}
      onConfirm={() => {
        if (isPending) {
          return;
        }
        setIsPending(true);
        void (async () => {
          try {
            const result = await deleteRecipeAction(recipe.id);
            if (result.ok) {
              setOpen(false);
            } else {
              setError(result.message);
            }
          } finally {
            setIsPending(false);
          }
        })();
      }}
    />
  );

  return { requestDelete, dialog };
}

/** Кнопка-меню действий владельца (замена прежней одиночной иконки «Удалить»). */
function OwnerActionsMenu({
  recipeTitle,
  onBrew,
  onDeleteRequest
}: {
  recipeTitle: string;
  onBrew?: () => void;
  onDeleteRequest: () => void;
}) {
  const items: DropdownMenuItem[] = [];
  if (onBrew) {
    items.push({ key: "brew", label: "Сварить", icon: <Timer className="h-4 w-4" aria-hidden />, onSelect: onBrew });
  }
  items.push({
    key: "delete",
    label: "Удалить",
    icon: <Trash2 className="h-4 w-4" aria-hidden />,
    tone: "danger",
    onSelect: onDeleteRequest
  });

  return (
    <DropdownMenu
      trigger={
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          aria-label={`Действия с рецептом «${recipeTitle}»`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-card/85 text-muted-foreground shadow-sm ring-1 ring-black/5 backdrop-blur transition-colors hover:bg-accent hover:text-foreground"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      }
      items={items}
      align="end"
    />
  );
}

const toStyleChip = (recipe: OwnerRecipeCardDto) =>
  recipe.styleCode && recipe.styleName ? { code: recipe.styleCode, name: recipe.styleName } : null;

const publicHref = (recipe: OwnerRecipeCardDto) =>
  recipe.publicationState === "published" && !recipe.hiddenAt ? `/recipes/${recipe.slug}` : null;

function VersionSuffix({ recipe }: { recipe: OwnerRecipeCardDto }) {
  if (recipe.versionCount <= 1) {
    return null;
  }
  return <span className="ml-1.5 text-sm font-normal text-muted-foreground">v{recipe.versionNumber}</span>;
}

/** Grid-карточка владельца — компактная раскладка (единый визуальный язык с {@link RecipeCard} витрины). */
export function OwnerRecipeCard({
  recipe,
  preferredGravityUnit,
  intent = "manage",
  onBrew
}: {
  recipe: OwnerRecipeCardDto;
  preferredGravityUnit: PreferredGravityUnit;
  intent?: OwnerRecipeCardIntent;
  onBrew?: (recipe: OwnerRecipeCardDto) => void;
}) {
  const editHref = `/app/recipes/${recipe.id}/edit`;
  const publicPage = publicHref(recipe);
  const brewMode = intent === "brew";
  const { requestDelete, dialog } = useDeleteRecipeDialog(recipe);

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-border hover:shadow-md">
      {brewMode ? (
        <button
          type="button"
          onClick={() => onBrew?.(recipe)}
          aria-label={`Сварить «${recipe.title}»`}
          className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        />
      ) : (
        <Link
          href={editHref}
          aria-label={recipe.title}
          className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        />
      )}

      <div className="pointer-events-none flex h-full flex-col gap-3">
        <div className="flex items-start gap-3">
          <RecipeThumb
            heroImage={recipe.heroImage}
            styleImageUrl={recipe.styleImageUrl}
            colorSrm={recipe.colorSrm}
            showColorMarker={false}
            className="h-16 w-16 shrink-0 rounded-xl ring-1 ring-inset ring-black/5"
            sizes="64px"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <div className={`flex flex-wrap items-center gap-1.5 ${intent === "manage" ? "pr-8" : "pr-0"}`}>
              <OwnerStatusBadge recipe={recipe} />
              <StyleChip style={toStyleChip(recipe)} styleHref={recipe.styleHref} className="min-w-0 truncate" />
              <RecipeMatchBadge recipeId={recipe.id} />
              {recipe.styleFit ? <StyleFitBadge fit={recipe.styleFit} /> : null}
            </div>
            <h2 className="line-clamp-2 text-base font-semibold leading-snug text-foreground">
              {recipe.title}
              <VersionSuffix recipe={recipe} />
            </h2>
            <HiddenReason recipe={recipe} />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 rounded-xl bg-muted p-2.5">
          <StatCell label="ABV" value={formatAbvShort(recipe.abv)} />
          <StatCell label="IBU" value={formatIbuShort(recipe.ibu)} />
          <StatCell label="OG" value={formatGravity(recipe.og, preferredGravityUnit)} />
          <ColorStatCell srm={recipe.colorSrm} />
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
          <UpdatedAgo value={recipe.updatedAt} className="truncate" />
          {brewMode ? (
            <span className="inline-flex items-center gap-1 font-semibold text-primary">
              <Timer className="h-3.5 w-3.5" aria-hidden />
              Сварить
            </span>
          ) : publicPage ? (
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

      {intent === "manage" ? (
        <div className="pointer-events-auto absolute right-2.5 top-2.5 z-10">
          <OwnerActionsMenu
            recipeTitle={recipe.title}
            onBrew={onBrew ? () => onBrew(recipe) : undefined}
            onDeleteRequest={requestDelete}
          />
        </div>
      ) : null}

      {dialog}
    </article>
  );
}

/** List-строка владельца (горизонтальная, числа в колонках на ≥sm). */
export function OwnerRecipeRow({
  recipe,
  preferredGravityUnit,
  intent = "manage",
  onBrew
}: {
  recipe: OwnerRecipeCardDto;
  preferredGravityUnit: PreferredGravityUnit;
  intent?: OwnerRecipeCardIntent;
  onBrew?: (recipe: OwnerRecipeCardDto) => void;
}) {
  const editHref = `/app/recipes/${recipe.id}/edit`;
  const publicPage = publicHref(recipe);
  const brewMode = intent === "brew";
  const showActionsMenu = intent === "manage";
  const { requestDelete, dialog } = useDeleteRecipeDialog(recipe);

  return (
    <article className={`group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-sm transition hover:border-border hover:shadow-md ${showActionsMenu ? "pr-14" : "pr-4"}`}>
      {brewMode ? (
        <button
          type="button"
          onClick={() => onBrew?.(recipe)}
          aria-label={`Сварить «${recipe.title}»`}
          className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        />
      ) : (
        <Link
          href={editHref}
          aria-label={recipe.title}
          className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        />
      )}

      <RecipeThumb
        heroImage={recipe.heroImage}
        styleImageUrl={recipe.styleImageUrl}
        colorSrm={recipe.colorSrm}
        className="aspect-[4/3] w-24 shrink-0 rounded-lg sm:w-28"
        sizes="120px"
      />

      <div className="pointer-events-none min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <OwnerStatusBadge recipe={recipe} />
          <StyleChip style={toStyleChip(recipe)} styleHref={recipe.styleHref} />
        </div>
        <h2 className="mt-1 line-clamp-1 text-base font-semibold leading-snug text-foreground">
          {recipe.title}
          <VersionSuffix recipe={recipe} />
        </h2>
        <HiddenReason recipe={recipe} />
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <UpdatedAgo value={recipe.updatedAt} />
          <RecipeMatchBadge recipeId={recipe.id} />
          {recipe.styleFit ? <StyleFitBadge fit={recipe.styleFit} /> : null}
          {!brewMode && publicPage ? (
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

      {brewMode ? (
        <span className="pointer-events-none inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">
          <Timer className="h-4 w-4" aria-hidden />
          Сварить
        </span>
      ) : showActionsMenu ? (
        <div className="pointer-events-auto absolute right-3 top-1/2 z-10 -translate-y-1/2">
          <OwnerActionsMenu
            recipeTitle={recipe.title}
            onBrew={onBrew ? () => onBrew(recipe) : undefined}
            onDeleteRequest={requestDelete}
          />
        </div>
      ) : null}

      {dialog}
    </article>
  );
}
