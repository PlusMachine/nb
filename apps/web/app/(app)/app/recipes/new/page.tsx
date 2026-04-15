import React from "react";
import { redirect } from "next/navigation";

import { RecipeEditorPage } from "@/components/recipes/recipe-editor-page";
import { listEquipmentProfiles } from "@/features/equipment-profiles/service";
import { getIngredientSuggestionByRef } from "@/features/ingredients/catalog-service";
import { getNextDefaultRecipeTitle } from "@/features/recipes/service";
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
    redirect(`/app/recipes/${recipeId}/edit`);
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
    />
  );
}
