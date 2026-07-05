"use client";

import React from "react";

import type { EquipmentProfileDto } from "@/features/equipment-profiles/contracts";
import type { IngredientSuggestionItem } from "@/features/ingredients/contracts";
import type { RecipeImageDto } from "@/features/recipe-images/contracts";
import type { RecipeDetailDto, RecipeStockCoverageDto } from "@/features/recipes/contracts";
import type { RecipePublicationState } from "@/features/recipes/contracts";
import type { PreferredGravityUnit } from "@/features/system/gravity-units";

import { RecipeDesigner, type RecipeSaveStatus } from "./recipe-designer";

type Props = {
  mode: "create" | "edit";
  initialRecipe?: RecipeDetailDto;
  initialTitle?: string;
  initialStyleId?: string;
  initialIngredientSelection?: IngredientSuggestionItem | null;
  initialStockCoverage?: RecipeStockCoverageDto | null;
  initialImages?: RecipeImageDto[];
  equipmentProfiles?: EquipmentProfileDto[];
  onSaveStatusChange?: (status: RecipeSaveStatus) => void;
  onRecipeCreated?: (recipe: RecipeDetailDto) => void;
  onPublicationStateChange?: (state: RecipePublicationState) => void;
  preferredGravityUnit: PreferredGravityUnit;
};

export function RecipeForm({
  mode,
  initialRecipe,
  initialTitle,
  initialStyleId,
  initialIngredientSelection,
  initialStockCoverage,
  initialImages,
  equipmentProfiles,
  onSaveStatusChange,
  onRecipeCreated,
  onPublicationStateChange,
  preferredGravityUnit
}: Props) {
  return (
    <RecipeDesigner
      mode={mode}
      initialRecipe={initialRecipe}
      initialTitle={initialTitle}
      initialStyleId={initialStyleId}
      initialIngredientSelection={initialIngredientSelection}
      initialStockCoverage={initialStockCoverage}
      initialImages={initialImages}
      equipmentProfiles={equipmentProfiles}
      onSaveStatusChange={onSaveStatusChange}
      onRecipeCreated={onRecipeCreated}
      onPublicationStateChange={onPublicationStateChange}
      preferredGravityUnit={preferredGravityUnit}
    />
  );
}
