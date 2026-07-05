"use client";

import React, { useCallback, useState } from "react";

import type { EquipmentProfileDto } from "@/features/equipment-profiles/contracts";
import type { IngredientSuggestionItem } from "@/features/ingredients/contracts";
import type { RecipeImageDto } from "@/features/recipe-images/contracts";
import type { RecipeDetailDto, RecipePublicationState, RecipeStockCoverageDto } from "@/features/recipes/contracts";
import type { PreferredGravityUnit } from "@/features/system/gravity-units";

import { RecipeCloneAttribution } from "./recipe-clone-attribution";
import type { RecipeSaveStatus } from "./recipe-designer";
import { RecipeForm } from "./recipe-form";

export function RecipeEditorPage({
  mode,
  recipe,
  initialTitle,
  initialStyleId,
  initialIngredientSelection,
  initialStockCoverage,
  initialImages = [],
  equipmentProfiles = [],
  preferredGravityUnit
}: {
  mode: "create" | "edit";
  recipe?: RecipeDetailDto;
  initialTitle?: string;
  initialStyleId?: string;
  initialIngredientSelection?: IngredientSuggestionItem | null;
  initialStockCoverage?: RecipeStockCoverageDto | null;
  initialImages?: RecipeImageDto[];
  equipmentProfiles?: EquipmentProfileDto[];
  preferredGravityUnit: PreferredGravityUnit;
}) {
  const [, setSaveStatus] = useState<RecipeSaveStatus>("saved");
  const [editorMode, setEditorMode] = useState<"create" | "edit">(mode);
  const [, setPublicationState] = useState<RecipePublicationState>(
    recipe?.publicationState === "published" ? "published" : "private"
  );
  const handleRecipeCreated = useCallback(() => {
    setEditorMode("edit");
  }, []);

  // Статус сохранения, ключевые метрики и действия публикации/варки живут в
  // закреплённой (sticky) полосе внутри RecipeDesigner.
  return (
    <main>
      {recipe?.clonedFrom && recipe.clonedFrom.authorId !== recipe.authorId ? (
        <div className="mb-3">
          <RecipeCloneAttribution clonedFrom={recipe.clonedFrom} ownerAuthorId={recipe.authorId} />
        </div>
      ) : null}
      <RecipeForm
        mode={editorMode}
        initialRecipe={recipe}
        initialTitle={initialTitle}
        initialStyleId={initialStyleId}
        initialIngredientSelection={initialIngredientSelection}
        initialStockCoverage={initialStockCoverage}
        initialImages={initialImages}
        equipmentProfiles={equipmentProfiles}
        onSaveStatusChange={setSaveStatus}
        onRecipeCreated={handleRecipeCreated}
        onPublicationStateChange={setPublicationState}
        preferredGravityUnit={preferredGravityUnit}
      />
    </main>
  );
}
