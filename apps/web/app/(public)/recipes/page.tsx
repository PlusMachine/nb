import type { Metadata } from "next";
import React from "react";

import { PublicRecipeList } from "@/components/recipes/public-recipe-list";
import { listPublicRecipes } from "@/features/recipes/service";

export const metadata: Metadata = {
  title: "Публичные рецепты",
  description: "Список опубликованных публичных рецептов домашнего пивоварения"
};

export default async function PublicRecipesPage() {
  const recipes = await listPublicRecipes();

  return (
    <main className="space-y-4">
      <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
        <h1 className="text-2xl font-semibold text-zinc-950 sm:text-3xl">Публичные рецепты</h1>
        <p className="text-sm text-zinc-600">Опубликованные рецепты сообщества с базовыми параметрами варки.</p>
      </section>

      {recipes.length
        ? <PublicRecipeList recipes={recipes} />
        : (
          <section className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
            <h2 className="text-lg font-semibold text-zinc-900">Публичных рецептов пока нет</h2>
            <p className="mt-2 text-sm text-zinc-600">Как только авторы опубликуют рецепты, они появятся здесь.</p>
          </section>
        )}
    </main>
  );
}
