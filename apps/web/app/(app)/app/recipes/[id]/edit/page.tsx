import React from "react";
import { notFound } from "next/navigation";

import { RecipeEditorPage } from "@/components/recipes/recipe-editor-page";
import { listEquipmentProfiles } from "@/features/equipment-profiles/service";
import { listRecipeImages } from "@/features/recipe-images/service";
import { countRecipeBrewBatches, getOwnedRecipeById } from "@/features/recipes/service";
import { requireUser } from "@/lib/auth";

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  try {
    // brewBatchCount — для подтверждения удаления: рецепт с варками удаляется не
    // бесследно (партии осиротеют), и диалог обязан назвать их число.
    const [recipe, initialImages, equipmentProfiles, brewBatchCount] = await Promise.all([
      getOwnedRecipeById(user.id, id),
      listRecipeImages(id, user.id),
      listEquipmentProfiles(user.id),
      countRecipeBrewBatches(user.id, id)
    ]);
    return (
      <RecipeEditorPage
        mode="edit"
        recipe={recipe}
        initialImages={initialImages}
        equipmentProfiles={equipmentProfiles}
        brewBatchCount={brewBatchCount}
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
