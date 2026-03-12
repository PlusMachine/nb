"use client";

import React from "react";

import { RecipeErrorState } from "@/components/recipes/recipe-error-state";

export default function PublicRecipesError({ reset }: { error: Error; reset: () => void }) {
  return (
    <RecipeErrorState
      title="Не удалось загрузить публичные рецепты"
      message="Попробуйте обновить страницу. Если проблема сохраняется, вернитесь позже."
      reset={reset}
    />
  );
}
