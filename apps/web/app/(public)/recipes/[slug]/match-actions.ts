"use server";

import { getSessionUser } from "@/lib/auth";
import type { RecipeMatchDto } from "@/features/recipes/contracts";

// Персональный матчинг «склад ↔ рецепт» тянется ПОСЛЕ гидрации (как и форма
// оценки), чтобы документ `/recipes/[slug]` не читал cookie и оставался
// кэшируемым для анонимов. Вся доменная логика — на сервере; наружу уходит
// только готовый % и разбивка по строкам.
export type RecipeMatchViewerState = {
  authenticated: boolean;
  match: RecipeMatchDto | null;
};

export const loadRecipeMatch = async (recipeId: string): Promise<RecipeMatchViewerState> => {
  const user = await getSessionUser();
  if (!user) {
    return { authenticated: false, match: null };
  }

  try {
    // Тяжёлый серверный модуль импортируем лениво, чтобы клиентский
    // RecipeMatchPanel, ссылающийся на этот action, не тянул его в граф модулей.
    const { computeRecipeMatch } = await import("@/features/recipes/match-service");
    const match = await computeRecipeMatch({ userId: user.id, recipeId });
    return { authenticated: true, match };
  } catch {
    return { authenticated: true, match: null };
  }
};
