import { getServerEnv } from "@/lib/env";

import type { RecipeDetailDto } from "../recipes/contracts";
import { getOwnedRecipeById } from "../recipes/service";

import type { LabelOverrides, LabelSlots } from "./contracts";
import { buildLabelSlots } from "./slots";

// Серверный сервис наклеек: доступ — только владелец рецепта
// (getOwnedRecipeById бросает NOT_FOUND, как и остальной recipe service).

export type OwnedRecipeLabelContext = {
  recipe: RecipeDetailDto;
  slots: LabelSlots;
};

/** Контекст наклеек для владельца рецепта (бросает NOT_FOUND, как recipe service). */
export const getOwnedRecipeLabelContext = async (
  userId: string,
  recipeId: string,
  options?: { bottlingDate?: string | null; overrides?: LabelOverrides }
): Promise<OwnedRecipeLabelContext> => {
  const recipe = await getOwnedRecipeById(userId, recipeId);
  const { APP_URL } = getServerEnv();
  const slots = buildLabelSlots({
    recipe,
    baseUrl: APP_URL,
    bottlingDate: options?.bottlingDate ?? null,
    overrides: options?.overrides
  });
  return { recipe, slots };
};
