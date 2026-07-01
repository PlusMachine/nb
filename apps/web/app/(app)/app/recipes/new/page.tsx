import React from "react";
import { notFound } from "next/navigation";

import { RecipeEditorPage } from "@/components/recipes/recipe-editor-page";
import { listEquipmentProfiles } from "@/features/equipment-profiles/service";
import { getIngredientSuggestionByRef } from "@/features/ingredients/catalog-service";
import { listRecipeImages } from "@/features/recipe-images/service";
import { listRecipeStockCoverage } from "@/features/recipes/inventory-service";
import { getNextDefaultRecipeTitle, getOwnedRecipeById } from "@/features/recipes/service";
import { requireUser } from "@/lib/auth";

export default async function NewRecipePage({
  searchParams
}: {
  searchParams?: Promise<{ recipeId?: string; addSource?: string; addId?: string }>;
}) {
  const user = await requireUser();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const recipeId = resolvedSearchParams?.recipeId?.trim();
  const addSource = resolvedSearchParams?.addSource?.trim();
  const addId = resolvedSearchParams?.addId?.trim();

  if (recipeId) {
    try {
      const [recipe, stockCoverage, initialImages, equipmentProfiles] = await Promise.all([
        getOwnedRecipeById(user.id, recipeId),
        listRecipeStockCoverage(user.id, recipeId),
        listRecipeImages(recipeId, user.id),
        listEquipmentProfiles(user.id)
      ]);

      return (
        <RecipeEditorPage
          mode="edit"
          recipe={recipe}
          initialStockCoverage={stockCoverage}
          initialImages={initialImages}
          equipmentProfiles={equipmentProfiles}
          preferredGravityUnit={user.preferredGravityUnit}
        />
      );
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        notFound();
      }
      throw error;
    }
  }

  const [initialTitle, initialIngredientSelection, equipmentProfiles] = await Promise.all([
    getNextDefaultRecipeTitle(user.id),
    addSource === "catalog" || addSource === "custom"
      ? getIngredientSuggestionByRef(user.id, addSource, addId ?? "")
      : Promise.resolve(null),
    listEquipmentProfiles(user.id)
  ]);

  return (
    <RecipeEditorPage
      mode="create"
      initialTitle={initialTitle}
      initialIngredientSelection={initialIngredientSelection}
      equipmentProfiles={equipmentProfiles}
      preferredGravityUnit={user.preferredGravityUnit}
    />
  );
}
