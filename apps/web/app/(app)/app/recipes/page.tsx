import React from "react";
import { RecipeEmptyState } from "@/components/recipes/recipe-empty-state";
import { RecipeList } from "@/components/recipes/recipe-list";
import { listRecipesForAuthor } from "@/features/recipes/service";
import { requireUser } from "@/lib/auth";

export default async function MyRecipesPage() {
  const user = await requireUser();
  const recipes = await listRecipesForAuthor(user.id);

  return (
    <main className="space-y-4">
      <section className="space-y-1">
        <h1 className="text-2xl font-semibold">Мои рецепты</h1>
        <p className="text-sm text-zinc-600">Просматривайте рецепты, их статус и ключевые показатели перед следующей варкой.</p>
      </section>
      {recipes.length === 0 ? <RecipeEmptyState /> : <RecipeList recipes={recipes} />}
    </main>
  );
}
