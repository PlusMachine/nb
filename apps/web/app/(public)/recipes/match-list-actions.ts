"use server";

import type { RecipeMatchDto } from "@/features/recipes/contracts";
import { getSessionUser } from "@/lib/auth";

/**
 * Батч: матч склад↔рецепт для видимых карточек. Карточные гриды вызывают это
 * ПОСЛЕ гидрации и раздают результат бейджам через контекст — серверный документ
 * витрины остаётся кэшируемым (сессию читаем только здесь, в динамическом
 * экшене). Неавторизованному / без склада — пустой объект (бейджей нет).
 */
export const loadRecipeMatchStates = async (
  recipeIds: string[]
): Promise<Record<string, RecipeMatchDto>> => {
  const user = await getSessionUser();
  if (!user || recipeIds.length === 0) {
    return {};
  }

  try {
    // Ленивый импорт тяжёлого серверного модуля, чтобы он не попадал в клиентский граф.
    const { computeRecipeMatchesForUser } = await import("@/features/recipes/match-service");
    return await computeRecipeMatchesForUser({ userId: user.id, recipeIds });
  } catch {
    return {};
  }
};
