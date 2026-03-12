import React from "react";

import type { RecipeDetailDto } from "@/features/recipes/contracts";

import { RecipeForm } from "./recipe-form";

export function RecipeEditorPage({ mode, recipe }: { mode: "create" | "edit"; recipe?: RecipeDetailDto }) {
  return (
    <main className="space-y-4">
      <section className="space-y-1">
        <h1 className="text-2xl font-semibold">{mode === "create" ? "Новый рецепт" : "Редактирование рецепта"}</h1>
        <p className="text-sm text-zinc-600">Заполните базовые параметры и ингредиенты. Расчет статистики выполняется на сервере.</p>
      </section>
      <RecipeForm mode={mode} initialRecipe={recipe} />
    </main>
  );
}
