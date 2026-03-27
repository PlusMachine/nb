"use client";

import React from "react";
import Link from "next/link";
import { Copy, X } from "lucide-react";

import { recipePublicationStateLabels, type RecipeListItemDto } from "@/features/recipes/contracts";
import { formatUpdatedLabel } from "@/features/recipes/format";

import { CloneRecipeButton } from "./clone-recipe-button";
import { DeleteRecipeButton } from "./delete-recipe-button";
import { RecipeStatsSummary } from "./recipe-stats-summary";

export function RecipeList({ recipes }: { recipes: RecipeListItemDto[] }) {
  return (
    <ul className="space-y-3">
      {recipes.map((recipe) => {
        const ownerRecipeHref = `/app/recipes/${recipe.id}/edit`;

        return (
          <li key={recipe.id} className="relative rounded-xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md">
            {/* Кнопка удаления в правом верхнем углу */}
            <div className="absolute right-2.5 top-2.5 z-10">
              <DeleteRecipeButton
                recipeId={recipe.id}
                title={recipe.title}
                renderTrigger={(onClick, isPending) => (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClick();
                    }}
                    disabled={isPending}
                    className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                    aria-label="Удалить рецепт"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              />
            </div>

            {/* Кликабельная карточка */}
            <Link href={ownerRecipeHref} className="block p-4 pr-12">
              <article className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-zinc-200 px-2 py-1 text-xs font-medium text-zinc-800">{recipePublicationStateLabels[recipe.publicationState]}</span>
                  <span className="text-xs text-zinc-500">{formatUpdatedLabel(recipe.updatedAt)}</span>
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-zinc-950 transition-colors hover:text-zinc-700">
                    {recipe.title}
                    {recipe.versionCount > 1 && (
                      <span className="ml-2 text-sm font-normal text-zinc-500">
                        v{recipe.versionNumber}
                      </span>
                    )}
                  </h2>
                  <p className="text-sm text-zinc-600">
                    Объём партии: {recipe.batchSizeEnteredQuantity} {recipe.batchSizeEnteredUnit} • кипячение {recipe.boilTimeMinutes} мин
                  </p>
                </div>
                <RecipeStatsSummary recipe={recipe} />
              </article>
            </Link>

            {/* Нижняя панель с кнопками */}
            <div className="flex items-center justify-between px-4 pb-4">
              <div className="flex items-center gap-x-2">
                {recipe.publicationState === "published" && recipe.slug ? (
                  <Link 
                    href={`/recipes/${recipe.slug}`} 
                    className="text-sm font-medium text-emerald-700 hover:text-emerald-900"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Публичная страница
                  </Link>
                ) : null}
              </div>
              
              {/* Кнопка клонирования справа */}
              <CloneRecipeButton
                recipeId={recipe.id}
                renderTrigger={(onClick, isPending) => (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClick();
                    }}
                    disabled={isPending}
                    className="inline-flex items-center gap-1 rounded-md bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-60"
                  >
                    <Copy className="h-3 w-3" />
                    {isPending ? "Клонируем..." : "Клонировать"}
                  </button>
                )}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
