"use client";

import React from "react";

import { RecipeErrorState } from "@/components/recipes/recipe-error-state";

export default function NewRecipeError({ reset }: { error: Error; reset: () => void }) {
  return <RecipeErrorState title="Не удалось открыть создание рецепта" message="Попробуйте обновить страницу." reset={reset} />;
}
