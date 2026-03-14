import React from "react";

import { RecipeEditorPage } from "@/components/recipes/recipe-editor-page";
import { getNextDefaultRecipeTitle } from "@/features/recipes/service";
import { requireUser } from "@/lib/auth";

export default async function NewRecipePage() {
  const user = await requireUser();
  const initialTitle = await getNextDefaultRecipeTitle(user.id);

  return <RecipeEditorPage mode="create" initialTitle={initialTitle} />;
}
