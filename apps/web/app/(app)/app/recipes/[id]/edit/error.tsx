"use client";

import React from "react";

import { RecipeErrorState } from "@/components/recipes/recipe-error-state";

export default function EditRecipeError({ reset }: { error: Error; reset: () => void }) {
  return <RecipeErrorState title="Не удалось открыть редактор рецепта" message="Попробуйте еще раз." reset={reset} />;
}
