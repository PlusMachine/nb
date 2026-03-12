import React from "react";
import Link from "next/link";

import type { RecipeListItemDto } from "@/features/recipes/contracts";

import { RecipeStatsSummary } from "./recipe-stats-summary";

const formatDate = (value: Date) => new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(value);

export function PublicRecipeList({ recipes }: { recipes: RecipeListItemDto[] }) {
  return (
    <ul className="space-y-3">
      {recipes.map((recipe) => (
        <li key={recipe.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <article className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
              <span className="rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-800">Опубликован</span>
              <span className="rounded-full bg-blue-100 px-2 py-1 font-medium text-blue-800">Публичный</span>
              <span>Обновлён: {formatDate(recipe.updatedAt)}</span>
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-zinc-950">{recipe.title}</h2>
              <p className="text-sm text-zinc-600">Объём партии: {recipe.batchSizeEnteredQuantity} {recipe.batchSizeEnteredUnit}</p>
            </div>

            <RecipeStatsSummary recipe={recipe} />

            <div>
              <Link
                href={`/recipes/${recipe.slug}`}
                className="text-sm font-medium text-blue-700 hover:text-blue-900"
              >
                Открыть рецепт
              </Link>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}
