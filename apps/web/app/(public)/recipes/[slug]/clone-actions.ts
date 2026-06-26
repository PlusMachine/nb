"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { RecipeCloneActionResult } from "@/features/recipes/contracts";
import { cloneRecipeFromPublic } from "@/features/recipes/service";
import { getSessionUser } from "@/lib/auth";

const cloneInputSchema = z.object({ recipeId: z.string().uuid() });

const mapCloneError = (error: unknown): RecipeCloneActionResult => {
  if (error instanceof Error && (error.message === "NOT_FOUND" || error.message === "FORBIDDEN")) {
    return { ok: false, code: "NOT_FOUND", message: "Рецепт не найден или недоступен для клонирования." };
  }
  return { ok: false, code: "ERROR", message: "Не удалось клонировать рецепт. Попробуйте ещё раз." };
};

/**
 * Мост «сохранённое/публичное → мои рецепты». Клонирует ЧУЖОЙ published-рецепт
 * (или свой) в новый черновик во владении текущего пользователя и возвращает его
 * id для редиректа в редактор. userId берётся ТОЛЬКО из серверной сессии —
 * клиентскому payload не доверяем (в сигнатуре userId нет).
 */
export const cloneRecipeFromPublicAction = async (input: {
  recipeId: string;
}): Promise<RecipeCloneActionResult> => {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, code: "AUTH", message: "Войдите, чтобы клонировать рецепт." };
  }

  const parsed = cloneInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "NOT_FOUND", message: "Рецепт не найден или недоступен для клонирования." };
  }

  try {
    const recipe = await cloneRecipeFromPublic(user.id, parsed.data.recipeId);
    revalidatePath("/app/recipes");
    return { ok: true, recipeId: recipe.id };
  } catch (error) {
    return mapCloneError(error);
  }
};
