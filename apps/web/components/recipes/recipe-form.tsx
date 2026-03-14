"use client";

import React from "react";

import type { RecipeDetailDto } from "@/features/recipes/contracts";
import type { RecipePublicationState } from "@/features/recipes/contracts";

import { RecipeDesigner, type RecipeSaveStatus } from "./recipe-designer";

type Props = {
  mode: "create" | "edit";
  initialRecipe?: RecipeDetailDto;
  initialTitle?: string;
  onSaveStatusChange?: (status: RecipeSaveStatus) => void;
  onRecipeCreated?: (recipe: RecipeDetailDto) => void;
  onPublicationStateChange?: (state: RecipePublicationState) => void;
};

export function RecipeForm({ mode, initialRecipe, initialTitle, onSaveStatusChange, onRecipeCreated, onPublicationStateChange }: Props) {
  return (
    <RecipeDesigner
      mode={mode}
      initialRecipe={initialRecipe}
      initialTitle={initialTitle}
      onSaveStatusChange={onSaveStatusChange}
      onRecipeCreated={onRecipeCreated}
      onPublicationStateChange={onPublicationStateChange}
    />
  );
}
