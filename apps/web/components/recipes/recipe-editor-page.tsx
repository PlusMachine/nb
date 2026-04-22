"use client";

import React, { useCallback, useState } from "react";

import type { EquipmentProfileDto } from "@/features/equipment-profiles/contracts";
import type { IngredientSuggestionItem } from "@/features/ingredients/contracts";
import type { RecipeImageDto } from "@/features/recipe-images/contracts";
import type { RecipeDetailDto, RecipePublicationState, RecipeStockCoverageDto } from "@/features/recipes/contracts";

import type { RecipeSaveStatus } from "./recipe-designer";
import { RecipeForm } from "./recipe-form";

export function RecipeEditorPage({
  mode,
  recipe,
  initialTitle,
  initialIngredientSelection,
  initialStockCoverage,
  initialImages = [],
  equipmentProfiles = []
}: {
  mode: "create" | "edit";
  recipe?: RecipeDetailDto;
  initialTitle?: string;
  initialIngredientSelection?: IngredientSuggestionItem | null;
  initialStockCoverage?: RecipeStockCoverageDto | null;
  initialImages?: RecipeImageDto[];
  equipmentProfiles?: EquipmentProfileDto[];
}) {
  const [, setSaveStatus] = useState<RecipeSaveStatus>("saved");
  const [editorMode, setEditorMode] = useState<"create" | "edit">(mode);
  const [, setPublicationState] = useState<RecipePublicationState>(
    recipe?.publicationState === "published" ? "published" : "private"
  );
  const handleRecipeCreated = useCallback(() => {
    setEditorMode("edit");
  }, []);

  // Status and visibility chrome now lives inside RecipeDesigner's sticky header.
  return (
    <main>
      <RecipeForm
        mode={editorMode}
        initialRecipe={recipe}
        initialTitle={initialTitle}
        initialIngredientSelection={initialIngredientSelection}
        initialStockCoverage={initialStockCoverage}
        initialImages={initialImages}
        equipmentProfiles={equipmentProfiles}
        onSaveStatusChange={setSaveStatus}
        onRecipeCreated={handleRecipeCreated}
        onPublicationStateChange={setPublicationState}
      />
    </main>
  );
}
