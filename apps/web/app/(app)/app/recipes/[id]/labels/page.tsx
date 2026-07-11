import React from "react";
import { notFound } from "next/navigation";

import { LabelStudio } from "@/components/recipes/labels/label-studio";
import { getOwnedRecipeById } from "@/features/recipes/service";
import { requireUser } from "@/lib/auth";

// «Наклейки» — генератор готовых наклеек на бутылки из данных рецепта
// (не редактор). Доступ — только владельцу рецепта.

export default async function RecipeLabelsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  try {
    const recipe = await getOwnedRecipeById(user.id, id);
    return (
      <LabelStudio
        recipeId={recipe.id}
        recipeTitle={recipe.title}
        isPublished={recipe.publicationState === "published"}
      />
    );
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }
}
