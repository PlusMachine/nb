import React from "react";
import Link from "next/link";
import { Beer, CircleCheck } from "lucide-react";

import type { BrewableRecipeDto } from "@/features/recipes/contracts";

import { BrewFromStockButton } from "./brew-from-stock-button";
import { RecipeThumb, StatCell, StyleChip } from "./recipe-card-parts";

const percentColor = (matchPercent: number) => {
  if (matchPercent >= 100) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (matchPercent >= 70) return "bg-lime-50 text-lime-700 ring-lime-200";
  if (matchPercent >= 1) return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-zinc-100 text-zinc-600 ring-zinc-200";
};

/**
 * Карточка «рецепт под ваш склад» в визуальном языке витрины `/recipes`
 * ({@link RecipeCard}): та же обложка (фото → фото BJCP-стиля → заливка по SRM),
 * чип стиля, компактные числовые ячейки и stretched-link. Отличается наполнением —
 * вместо параметров рецепта (ABV/IBU/OG) показывает метрики матча со складом:
 * процент совпадения (цветной пилл-«светофор» на месте бейджа рейтинга/готовности)
 * и покрытие ингредиентов.
 */
function BrewableRecipeCard({ recipe }: { recipe: BrewableRecipeDto }) {
  const style =
    recipe.styleCode && recipe.styleName ? { code: recipe.styleCode, name: recipe.styleName } : null;

  const fullyCovered = recipe.missingCount === 0;
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
    <article className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 hover:shadow-md">
      <Link
        href={`/recipes/${recipe.slug}`}
        aria-label={recipe.title}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-500"
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
                className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ring-1 ${percentColor(recipe.matchPercent)}`}
              >
                {recipe.matchPercent}%
              </span>
            </div>
            <h2 className="line-clamp-2 text-base font-semibold leading-snug text-zinc-950 group-hover:text-zinc-700">
              {recipe.title}
            </h2>
          </div>
        </div>

        {fullyCovered ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 p-2.5">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
              <CircleCheck className="h-4 w-4" aria-hidden />
              Хватает всего
            </span>
            <BrewFromStockButton recipeId={recipe.recipeId} slug={recipe.slug} />
          </div>
        ) : (
          <div className="grid grid-cols-[auto_1fr] gap-4 rounded-xl bg-zinc-50 p-2.5">
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
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-50 text-amber-600">
          <Beer className="h-3.5 w-3.5" />
        </div>
        <h2 className="text-base font-semibold text-zinc-900">Можно сварить из ваших запасов</h2>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {recipes.map((recipe) => (
          <li key={recipe.recipeId}>
            <BrewableRecipeCard recipe={recipe} />
          </li>
        ))}
      </ul>
    </section>
  );
}
