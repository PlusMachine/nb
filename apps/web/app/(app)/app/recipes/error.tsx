"use client";

import React from "react";
import { RecipeErrorState } from "@/components/recipes/recipe-error-state";

export default function RecipesError({ reset }: { error: Error; reset: () => void }) {
  return (
    <RecipeErrorState
      title='Не удалось загрузить "Мои рецепты"'
      message="Попробуйте обновить страницу. Если ошибка повторяется, вернитесь позже."
      reset={reset}
    />
  );
}
