import React from "react";
import Link from "next/link";
import { MyRecipesGallery } from "@/components/recipes/my-recipes-gallery";
import { RecipeEmptyState } from "@/components/recipes/recipe-empty-state";
import { RecipeTabs } from "@/components/recipes/recipe-tabs";
import { listAuthorRecipeCards } from "@/features/recipes/service";
import { requireUser } from "@/lib/auth";

export async function MyRecipesContent() {
  const user = await requireUser();
  const recipes = await listAuthorRecipeCards(user.id);

  return (
    <main className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Рецепты</h1>
        <Link href="/app/recipes/new" className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white">Создать рецепт</Link>
      </section>
      <RecipeTabs />
      {recipes.length === 0 ? <RecipeEmptyState /> : <MyRecipesGallery recipes={recipes} preferredGravityUnit={user.preferredGravityUnit} />}
    </main>
  );
}
