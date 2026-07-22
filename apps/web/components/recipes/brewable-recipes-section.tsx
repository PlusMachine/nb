import React from "react";
import Link from "next/link";
import { Beer } from "lucide-react";

import { srmToHex } from "@/features/recipes/beer-color";
import { resolveBrewabilityBadge } from "@/features/recipes/brewability-badge";
import type { BrewableRecipeDto } from "@/features/recipes/contracts";

import { BrewabilityBadgePill } from "./brewability-badge-pill";
import { BrewFromStockButton } from "./brew-from-stock-button";
import { RecipeThumb } from "./recipe-card-parts";

/**
 * Карточка «рецепт под ваш склад» — облегчённая строка для вспомогательных
 * поверхностей (rail «Моего склада», секция дашборда), а не витринная карточка:
 * название во всю ширину (обложка не отжимает текст в узкой колонке, вместо неё —
 * точка цвета по SRM), чип стиля отдельной строкой, внизу статус матча.
 * Процент совпадения не показываем — он без подписи нечитаем и дублирует
 * покрытие «N из M»; семантику статуса по-прежнему решает только
 * resolveBrewabilityBadge (тот же резолвер, что у витрины и /app/recipes).
 */
export function BrewableRecipeCard({ recipe, href }: { recipe: BrewableRecipeDto; href?: string }) {
  const style =
    recipe.styleCode && recipe.styleName ? { code: recipe.styleCode, name: recipe.styleName } : null;
  // На «Мой склад» карточка ведёт на публичную страницу рецепта; на дашборде это
  // свои рецепты (в т.ч. черновики без публичной страницы) — вызывающий передаёт
  // ссылку в редактор.
  const targetHref = href ?? `/recipes/${recipe.slug}`;

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
    <article className="group relative overflow-hidden rounded-xl border border-border bg-card p-3 shadow-sm transition hover:shadow-md">
      <Link
        href={targetHref}
        aria-label={recipe.title}
        className="absolute inset-0 z-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />

      {/* Ховер-обложка (аналог растущей миниатюры list-вида витрины, но без
          изменения геометрии — карточки в колонке не должны прыгать под курсором):
          фото проявляется фоном под градиентной подложкой слева-направо, текст
          остаётся на читаемом фоне. Только для устройств с мышью. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 [@media(hover:hover)]:group-hover:opacity-100"
      >
        {/* Кадр сдвинут вправо: контейнер шириной с карточку начинается на 40%
            и вылезает за правый край (article его обрезает overflow-hidden), так
            что ЦЕНТР фото — где обычно кружка/банка — оказывается у правой
            границы карточки, в самой прозрачной зоне подложки, а не под ней. */}
        <span className="absolute inset-y-0 left-[40%] w-full">
          <RecipeThumb
            heroImage={recipe.heroImage}
            styleImageUrl={recipe.styleImageUrl}
            colorSrm={recipe.colorSrm}
            showColorMarker={false}
            sharpenOnHover
            className="h-full w-full"
            sizes="200px"
          />
        </span>
        <span className="absolute inset-0 bg-gradient-to-r from-card from-45% via-card/70 via-75% to-card/10" />
      </span>

      <div className="pointer-events-none relative space-y-1.5">
        <h2 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {recipe.colorSrm != null && Number.isFinite(recipe.colorSrm) ? (
            <span
              aria-hidden
              className="mr-1.5 inline-block h-3 w-3 rounded-full align-[-1px] ring-1 ring-inset ring-black/10"
              style={{ backgroundColor: srmToHex(recipe.colorSrm) }}
            />
          ) : null}
          {recipe.title}
        </h2>
        {style ? (
          <p className="max-w-full truncate text-xs font-medium text-foreground/70">
            {style.name} · {style.code}
          </p>
        ) : null}

        {badge.tier === "ready" ? (
          <div className="flex items-center justify-between gap-3 pt-1">
            <BrewabilityBadgePill badge={badge} />
            <BrewFromStockButton recipeId={recipe.recipeId} slug={recipe.slug} recipeTitle={recipe.title} />
          </div>
        ) : (
          <p className="pt-0.5 text-xs text-muted-foreground">
            есть: <span className="font-medium tabular-nums text-foreground">{recipe.coveredLines} из {recipe.totalLines}</span>
            {" · "}не хватает: {missingLabel}
          </p>
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
