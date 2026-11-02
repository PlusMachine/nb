"use client";

import React from "react";
import { RecipeErrorState } from "@/components/recipes/recipe-error-state";

export default function RecipeDetailError({ reset }: { error: Error; reset: () => void }) {
  return (
    <RecipeErrorState
      title="Не удалось загрузить рецепт"
      message="Попробуйте ещё раз. Если ошибка повторяется, вернитесь к списку рецептов."
      reset={reset}
    />
  );
}
