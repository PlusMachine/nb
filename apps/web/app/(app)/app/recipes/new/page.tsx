import React from "react";
import { redirect } from "next/navigation";

import { RecipeEditorPage } from "@/components/recipes/recipe-editor-page";
import { getNextDefaultRecipeTitle } from "@/features/recipes/service";
import { requireUser } from "@/lib/auth";

export default async function NewRecipePage({
  searchParams
}: {
  searchParams?: Promise<{ recipeId?: string }>;
}) {
  const user = await requireUser();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const recipeId = resolvedSearchParams?.recipeId?.trim();

  if (recipeId) {
    redirect(`/app/recipes/${recipeId}/edit`);
  }

  const initialTitle = await getNextDefaultRecipeTitle(user.id);

  return <RecipeEditorPage mode="create" initialTitle={initialTitle} />;
}
