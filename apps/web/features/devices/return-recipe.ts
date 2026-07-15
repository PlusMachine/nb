import { getRecipeById } from "@/features/recipes/service";

import { resolveReturnRecipeHref } from "./return-recipe-core";

// =============================================================================
//  features/devices — return-recipe.ts
//  DB-обвязка над return-recipe-core.ts: резолвит ?returnRecipe=<id> с
//  /app/devices в контекст для баннера «Продолжить варку» (Ф7). Недоступный
//  (чужой непубличный/удалённый) рецепт — молча null, без баннера: гейт
//  доступа тот же, что у BrewPickerDialog (getRecipeById — свой любой статус
//  или чужой published).
// =============================================================================

export type DeviceReturnRecipe = {
  id: string;
  title: string;
  href: string;
};

export const loadDeviceReturnRecipe = async (
  viewerId: string,
  recipeId: string
): Promise<DeviceReturnRecipe | null> => {
  try {
    const recipe = await getRecipeById(viewerId, recipeId);
    return {
      id: recipe.id,
      title: recipe.title,
      href: resolveReturnRecipeHref(recipe, viewerId)
    };
  } catch {
    return null;
  }
};
