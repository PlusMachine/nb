import Link from "next/link";
import React from "react";

import { RecipesGrid } from "@/components/recipes/recipes-grid";
import { RecipeTabs } from "@/components/recipes/recipe-tabs";
import { listSavedRecipes } from "@/features/recipes/service";
import { requireUser } from "@/lib/auth";

export const metadata = {
  title: "Сохранённые"
};

export default async function SavedRecipesPage() {
  const user = await requireUser();
  const recipes = await listSavedRecipes(user.id);

  return (
    <main className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Сохранённые</h1>
        <Link href="/app/recipes/new" className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background">
          Создать рецепт
        </Link>
      </section>
      <RecipeTabs />

      {recipes.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Здесь пока пусто. Откройте{" "}
            <Link href="/recipes" className="font-medium text-foreground underline underline-offset-2">
              рецепты сообщества
            </Link>{" "}
            и сохраните понравившиеся.
          </p>
        </section>
      ) : (
        <RecipesGrid recipes={recipes} showCloneAction preferredGravityUnit={user.preferredGravityUnit} />
      )}
    </main>
  );
}
