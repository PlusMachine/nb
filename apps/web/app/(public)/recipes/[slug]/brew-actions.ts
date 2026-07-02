"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createBrewBatchFromRecipe } from "@/features/brew-batches/service";
import { getSessionUser } from "@/lib/auth";

const brewInputSchema = z.object({ recipeId: z.string().uuid() });

export type StartBrewFromRecipeResult =
  | { ok: true; brewBatchId: string }
  | { ok: false; code: "AUTH" | "NOT_FOUND" | "ERROR"; message: string };

/**
 * Мост «любой доступный рецепт → варка» БЕЗ клонирования: создаёт партию варки во
 * владении текущего пользователя из снапшота рецепта (своего любого статуса или
 * чужого published). В «Мои рецепты» ничего не копируется. userId берётся ТОЛЬКО
 * из серверной сессии — клиентскому payload не доверяем (в сигнатуре userId нет).
 */
export const startBrewFromRecipeAction = async (input: {
  recipeId: string;
}): Promise<StartBrewFromRecipeResult> => {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, code: "AUTH", message: "Войдите, чтобы начать варку." };
  }

  const parsed = brewInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "NOT_FOUND", message: "Рецепт не найден или недоступен." };
  }

  try {
    const batch = await createBrewBatchFromRecipe(user.id, parsed.data.recipeId);
    revalidatePath("/app/brew-batches");
    return { ok: true, brewBatchId: batch.id };
  } catch (error) {
    if (error instanceof Error && (error.message === "NOT_FOUND" || error.message === "FORBIDDEN")) {
      return { ok: false, code: "NOT_FOUND", message: "Рецепт не найден или недоступен для варки." };
    }
    return { ok: false, code: "ERROR", message: "Не удалось начать варку. Попробуйте ещё раз." };
  }
};
