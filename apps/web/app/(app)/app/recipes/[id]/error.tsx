"use client";

import React from "react";
import { RecipeErrorState } from "@/components/recipes/recipe-error-state";

export default function RecipeDetailError({ reset }: { error: Error; reset: () => void }) {
  return (
    <RecipeErrorState
      title="Не удалось загрузить рецепт"
      message="Попробуйте ещё раз. Если проблема сохраняется, вернитесь к списку рецептов позже."
      reset={reset}
    />
  );
}
