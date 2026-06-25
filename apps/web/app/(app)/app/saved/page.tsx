import Link from "next/link";
import React from "react";

import { RecipesGrid } from "@/components/recipes/recipes-grid";
import { listSavedRecipes } from "@/features/recipes/service";
import { requireUser } from "@/lib/auth";

export const metadata = {
  title: "Избранное"
};

export default async function SavedRecipesPage() {
  const user = await requireUser();
  const recipes = await listSavedRecipes(user.id);

  return (
    <main className="space-y-6 py-8">
      <section className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-6">
        <h1 className="text-2xl font-semibold text-zinc-950 sm:text-3xl">Избранное</h1>
        <p className="text-sm text-zinc-600">Сохранённые рецепты сообщества — в порядке добавления.</p>
      </section>

      {recipes.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-zinc-200 bg-white p-10 text-center">
          <p className="text-sm text-zinc-600">
            Здесь пока пусто. Открой{" "}
            <Link href="/recipes" className="font-medium text-zinc-900 underline underline-offset-2">
              витрину рецептов
            </Link>{" "}
            и нажми на флажок, чтобы сохранить рецепт.
          </p>
        </section>
      ) : (
        <RecipesGrid recipes={recipes} />
      )}
    </main>
  );
}
