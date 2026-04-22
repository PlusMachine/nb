import React from "react";
import { notFound } from "next/navigation";

import { RecipeEditorPage } from "@/components/recipes/recipe-editor-page";
import { listEquipmentProfiles } from "@/features/equipment-profiles/service";
import { listRecipeImages } from "@/features/recipe-images/service";
import { listRecipeStockCoverage } from "@/features/recipes/inventory-service";
import { getOwnedRecipeById } from "@/features/recipes/service";
import { requireUser } from "@/lib/auth";

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  try {
    const [recipe, stockCoverage, initialImages, equipmentProfiles] = await Promise.all([
      getOwnedRecipeById(user.id, id),
      listRecipeStockCoverage(user.id, id),
      listRecipeImages(id, user.id),
      listEquipmentProfiles(user.id)
    ]);
    return (
      <RecipeEditorPage
        mode="edit"
        recipe={recipe}
        initialStockCoverage={stockCoverage}
        initialImages={initialImages}
        equipmentProfiles={equipmentProfiles}
      />
    );
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }
}
