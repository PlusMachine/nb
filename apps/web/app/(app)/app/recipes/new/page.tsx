import React from "react";
import { notFound } from "next/navigation";
import { getBeerStyleById } from "@nb/brewing-core";

import { RecipeEditorPage } from "@/components/recipes/recipe-editor-page";
import { listEquipmentProfiles } from "@/features/equipment-profiles/service";
import { getIngredientSuggestionByRef } from "@/features/ingredients/catalog-service";
import { getInventoryStockCategoryFlags } from "@/features/inventory/service";
import { listRecipeImages } from "@/features/recipe-images/service";
import { countRecipeBrewBatches, getNextDefaultRecipeTitle, getOwnedRecipeById } from "@/features/recipes/service";
import { requireUser } from "@/lib/auth";

export default async function NewRecipePage({
  searchParams
}: {
  searchParams?: Promise<{ recipeId?: string; addSource?: string; addId?: string; style?: string }>;
}) {
  const user = await requireUser();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const recipeId = resolvedSearchParams?.recipeId?.trim();
  const addSource = resolvedSearchParams?.addSource?.trim();
  const addId = resolvedSearchParams?.addId?.trim();
  // Предзаполнение стиля со страницы BJCP-стиля: параметр — bjcpId (напр. `24A`).
  // getBeerStyleById резолвит его в фикстуру; берём её id (в БД styleId = fixture id).
  // Если не резолвится (мусорный параметр) — просто не предзаполняем.
  const styleParam = resolvedSearchParams?.style?.trim();
  const initialStyleId = styleParam ? getBeerStyleById(styleParam)?.id : undefined;

  if (recipeId) {
    try {
      const [recipe, initialImages, equipmentProfiles, brewBatchCount, inventoryStockByCategory] = await Promise.all([
        getOwnedRecipeById(user.id, recipeId),
        listRecipeImages(recipeId, user.id),
        listEquipmentProfiles(user.id),
        countRecipeBrewBatches(user.id, recipeId),
        getInventoryStockCategoryFlags(user.id)
      ]);

      return (
        <RecipeEditorPage
          mode="edit"
          recipe={recipe}
          initialImages={initialImages}
          equipmentProfiles={equipmentProfiles}
          brewBatchCount={brewBatchCount}
          inventoryStockByCategory={inventoryStockByCategory}
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

  const [initialTitle, initialIngredientSelection, equipmentProfiles, inventoryStockByCategory] = await Promise.all([
    getNextDefaultRecipeTitle(user.id),
    addSource === "catalog" || addSource === "custom"
      ? getIngredientSuggestionByRef(user.id, addSource, addId ?? "")
      : Promise.resolve(null),
    listEquipmentProfiles(user.id),
    getInventoryStockCategoryFlags(user.id)
  ]);

  return (
    <RecipeEditorPage
      mode="create"
      initialTitle={initialTitle}
      initialStyleId={initialStyleId}
      initialIngredientSelection={initialIngredientSelection}
      equipmentProfiles={equipmentProfiles}
      inventoryStockByCategory={inventoryStockByCategory}
      preferredGravityUnit={user.preferredGravityUnit}
    />
  );
}
