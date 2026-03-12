import React from "react";
import Link from "next/link";

import type { RecipeListItemDto } from "@/features/recipes/contracts";

import { RecipeStatsSummary } from "./recipe-stats-summary";

const statusLabel: Record<RecipeListItemDto["status"], string> = {
  draft: "Черновик",
  private: "Приватный",
  published: "Опубликован"
};

const visibilityLabel: Record<RecipeListItemDto["visibility"], string> = {
  private: "Только автор",
  public: "Публичный"
};

const formatDate = (value: Date) => new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(value);

export function RecipeList({ recipes }: { recipes: RecipeListItemDto[] }) {
  return (
    <ul className="space-y-3">
      {recipes.map((recipe) => (
        <li key={recipe.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <article className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-zinc-200 px-2 py-1 text-xs font-medium text-zinc-800">{statusLabel[recipe.status]}</span>
              <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">{visibilityLabel[recipe.visibility]}</span>
              <span className="text-xs text-zinc-500">Обновлён: {formatDate(recipe.updatedAt)}</span>
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-zinc-950">{recipe.title}</h2>
              <p className="text-sm text-zinc-600">
                Объём партии: {recipe.batchSizeEnteredQuantity} {recipe.batchSizeEnteredUnit}
              </p>
            </div>
            <RecipeStatsSummary recipe={recipe} />
            <div>
              <Link href={`/app/recipes/${recipe.id}`} className="text-sm font-medium text-blue-700 hover:text-blue-900">
                Открыть рецепт
              </Link>
              <span className="mx-2 text-zinc-400">·</span>
              <Link href={`/app/recipes/${recipe.id}/edit`} className="text-sm font-medium text-zinc-700 hover:text-zinc-900">
                Редактировать
              </Link>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}
