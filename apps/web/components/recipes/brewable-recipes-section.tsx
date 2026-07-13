import React from "react";
import Link from "next/link";
import { Beer } from "lucide-react";

import { resolveBrewabilityBadge, type BrewabilityBadge } from "@/features/recipes/brewability-badge";
import type { BrewableRecipeDto } from "@/features/recipes/contracts";

import { BrewabilityBadgePill } from "./brewability-badge-pill";
import { BrewFromStockButton } from "./brew-from-stock-button";
import { RecipeThumb, StatCell, StyleChip } from "./recipe-card-parts";

// «Светофор» процента завязан на тот же бейдж, что и плашка внизу карточки:
// иначе 100 % + qtyShort дало бы зелёный процент рядом с салатовым «Почти
// хватает» (ровно эта рассинхронизация и подсветила враньё бейджа).
const percentColor = (matchPercent: number, badge: BrewabilityBadge) => {
  if (badge.tier === "ready" && !badge.qtyShort) {
    return "bg-success-subtle text-success-subtle-foreground ring-success/30";
  }
  if (matchPercent >= 70) return "bg-lime-50 text-lime-700 ring-lime-200 dark:bg-lime-500/15 dark:text-lime-300 dark:ring-lime-500/30";
  if (matchPercent >= 1) return "bg-warning-subtle text-warning-subtle-foreground ring-warning/30";
  return "bg-muted text-muted-foreground ring-border";
};

/**
 * Карточка «рецепт под ваш склад» в визуальном языке витрины `/recipes`
 * ({@link RecipeCard}): та же обложка (фото → фото BJCP-стиля → заливка по SRM),
 * чип стиля, компактные числовые ячейки и stretched-link. Отличается наполнением —
 * вместо параметров рецепта (ABV/IBU/OG) показывает метрики матча со складом:
 * процент совпадения (цветной пилл-«светофор» на месте бейджа рейтинга/готовности)
 * и покрытие ингредиентов.
 */
export function BrewableRecipeCard({ recipe, href }: { recipe: BrewableRecipeDto; href?: string }) {
  const style =
    recipe.styleCode && recipe.styleName ? { code: recipe.styleCode, name: recipe.styleName } : null;
  // На «Мой склад» карточка ведёт на публичную страницу рецепта; на дашборде это
  // свои рецепты (в т.ч. черновики без публичной страницы) — вызывающий передаёт
  // ссылку в редактор.
  const targetHref = href ?? `/recipes/${recipe.slug}`;

  // Единственный источник семантики бейджа — тот же резолвер, что у витрины и
  // /app/recipes. Раньше карточка судила по одному лишь missingCount ("нет строк
  // со статусом missing") и показывала зелёное «Хватает всего» рецепту, где солода
  // 1 кг из 4.
  const badge = resolveBrewabilityBadge(recipe);
  // Кратко перечисляем чего не хватает: до двух названий, остальное — «+N».
  // Фолбэк на число, если у недостающих строк нет отображаемых имён.
  const missingLabel = (() => {
    const names = recipe.missingNames;
    if (names.length === 0) {
      return String(recipe.missingCount);
    }
    const shown = names.slice(0, 2).join(", ");
    const rest = recipe.missingCount - Math.min(2, names.length);
    return rest > 0 ? `${shown} +${rest}` : shown;
  })();

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-border hover:shadow-md">
      <Link
        href={targetHref}
        aria-label={recipe.title}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />

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
            <div className="flex flex-wrap items-center gap-1.5">
              <StyleChip style={style} styleHref={recipe.styleHref} className="min-w-0 truncate" />
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ring-1 ${percentColor(recipe.matchPercent, badge)}`}
              >
                {recipe.matchPercent}%
              </span>
            </div>
            <h2 className="line-clamp-2 text-base font-semibold leading-snug text-foreground group-hover:text-muted-foreground">
              {recipe.title}
            </h2>
          </div>
        </div>

        {badge.tier === "ready" ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted p-2.5">
            <BrewabilityBadgePill badge={badge} size="md" />
            <BrewFromStockButton recipeId={recipe.recipeId} slug={recipe.slug} recipeTitle={recipe.title} />
          </div>
        ) : (
          <div className="grid grid-cols-[auto_1fr] gap-4 rounded-xl bg-muted p-2.5">
            <StatCell label="Ингредиенты" value={`${recipe.coveredLines} из ${recipe.totalLines}`} />
            <StatCell label="Не хватает" value={missingLabel} />
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * Обратный матчинг: опубликованные рецепты, которые лучше всего подходят под
 * текущий склад пользователя. Рендерится на странице «Мой склад». Если
 * подходящих рецептов нет — секция не показывается.
 */
export function BrewableRecipesSection({ recipes }: { recipes: BrewableRecipeDto[] }) {
  if (recipes.length === 0) {
    return null;
  }

  return (
    // id/scroll-mt — цель для якоря секции в шапке на мобиле.
    // sm:grid-cols-2 lg:grid-cols-1 — две карточки в ряд на планшете, но одна
    // колонка внутри узкого правого rail на десктопе.
    <section id="brewable" className="scroll-mt-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-warning-subtle text-warning-subtle-foreground">
          <Beer className="h-3.5 w-3.5" />
        </div>
        <h2 className="text-base font-semibold text-foreground">Рецепты под ваш склад</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          {recipes.length}
        </span>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {recipes.map((recipe) => (
          <li key={recipe.recipeId}>
            <BrewableRecipeCard recipe={recipe} />
          </li>
        ))}
      </ul>
    </section>
  );
}
