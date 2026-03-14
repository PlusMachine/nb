import React from "react";

import type { RecipeDetailDto } from "@/features/recipes/contracts";

import { RecipeForm } from "./recipe-form";

export function RecipeEditorPage({ mode, recipe }: { mode: "create" | "edit"; recipe?: RecipeDetailDto }) {
  return (
    <main className="space-y-5">
      <section className="space-y-1">
        <h1 className="text-2xl font-semibold">{mode === "create" ? "Recipe Designer" : "Редактирование рецепта"}</h1>
        <p className="text-sm text-zinc-600">Компактный summary-first designer с живым пересчётом draft и редакторами по требованию.</p>
      </section>
      <RecipeForm mode={mode} initialRecipe={recipe} />
    </main>
  );
}
