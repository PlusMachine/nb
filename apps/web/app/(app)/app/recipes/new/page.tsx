import React from "react";

import { RecipeEditorPage } from "@/components/recipes/recipe-editor-page";
import { requireUser } from "@/lib/auth";

export default async function NewRecipePage() {
  await requireUser();
  return <RecipeEditorPage mode="create" />;
}
