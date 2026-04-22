"use client";

import React from "react";

import type { EquipmentProfileDto } from "@/features/equipment-profiles/contracts";
import type { IngredientSuggestionItem } from "@/features/ingredients/contracts";
import type { RecipeImageDto } from "@/features/recipe-images/contracts";
import type { RecipeDetailDto, RecipeStockCoverageDto } from "@/features/recipes/contracts";
import type { RecipePublicationState } from "@/features/recipes/contracts";

import { RecipeDesigner, type RecipeSaveStatus } from "./recipe-designer";

type Props = {
  mode: "create" | "edit";
  initialRecipe?: RecipeDetailDto;
  initialTitle?: string;
  initialIngredientSelection?: IngredientSuggestionItem | null;
  initialStockCoverage?: RecipeStockCoverageDto | null;
  initialImages?: RecipeImageDto[];
  equipmentProfiles?: EquipmentProfileDto[];
  onSaveStatusChange?: (status: RecipeSaveStatus) => void;
  onRecipeCreated?: (recipe: RecipeDetailDto) => void;
  onPublicationStateChange?: (state: RecipePublicationState) => void;
};

export function RecipeForm({
  mode,
  initialRecipe,
  initialTitle,
  initialIngredientSelection,
  initialStockCoverage,
  initialImages,
  equipmentProfiles,
  onSaveStatusChange,
  onRecipeCreated,
  onPublicationStateChange
}: Props) {
  return (
    <RecipeDesigner
      mode={mode}
      initialRecipe={initialRecipe}
      initialTitle={initialTitle}
      initialIngredientSelection={initialIngredientSelection}
      initialStockCoverage={initialStockCoverage}
      initialImages={initialImages}
      equipmentProfiles={equipmentProfiles}
      onSaveStatusChange={onSaveStatusChange}
      onRecipeCreated={onRecipeCreated}
      onPublicationStateChange={onPublicationStateChange}
    />
  );
}
