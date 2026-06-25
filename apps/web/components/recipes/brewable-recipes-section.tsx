import React from "react";
import Link from "next/link";
import { Beer } from "lucide-react";

import type { BrewableRecipeDto } from "@/features/recipes/contracts";

const percentColor = (matchPercent: number) => {
  if (matchPercent >= 100) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (matchPercent >= 70) return "bg-lime-50 text-lime-700 ring-lime-200";
  if (matchPercent >= 1) return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-zinc-100 text-zinc-600 ring-zinc-200";
};

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
    <section className="space-y-3 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-50 text-amber-600">
          <Beer className="h-3.5 w-3.5" />
        </div>
        <h2 className="text-base font-semibold text-zinc-900">Можно сварить из вашего склада</h2>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {recipes.map((recipe) => (
          <li key={recipe.recipeId}>
            <Link
              href={`/recipes/${recipe.slug}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-zinc-100 px-3 py-2.5 transition hover:border-zinc-200 hover:bg-zinc-50"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-zinc-900">{recipe.title}</span>
                <span className="block text-xs text-zinc-500">
                  есть {recipe.coveredLines} из {recipe.totalLines}
                  {recipe.missingCount > 0 ? ` · не хватает ${recipe.missingCount}` : ""}
                </span>
              </span>
              <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ring-1 ${percentColor(recipe.matchPercent)}`}>
                {recipe.matchPercent}%
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
