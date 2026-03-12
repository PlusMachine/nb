import React from "react";
import { notFound } from "next/navigation";

import { RecipeEditorPage } from "@/components/recipes/recipe-editor-page";
import { getOwnedRecipeById } from "@/features/recipes/service";
import { requireUser } from "@/lib/auth";

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  try {
    const recipe = await getOwnedRecipeById(user.id, id);
    return <RecipeEditorPage mode="edit" recipe={recipe} />;
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }
}
