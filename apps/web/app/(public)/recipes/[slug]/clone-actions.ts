"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { RecipeCloneActionResult } from "@/features/recipes/contracts";
import { cloneRecipeFromPublic } from "@/features/recipes/service";
import { getSessionUser } from "@/lib/auth";
import { assertRateLimit } from "@nb/auth";

const cloneInputSchema = z.object({
  recipeId: z.string().uuid(),
  equipmentProfileId: z.string().uuid().optional().nullable(),
  // Опционально: целевой объём (л) и/или efficiency (%) из предпросмотра
  // «Пересчитать под свои параметры» (RecipeScalePanel) — клон сразу в этих
  // цифрах, без ручной правки после.
  targetBatchVolumeLitres: z.coerce.number().positive().max(1000).optional().nullable(),
  targetEfficiencyPct: z.coerce.number().positive().max(100).optional().nullable()
});

const mapCloneError = (error: unknown): RecipeCloneActionResult => {
  if (error instanceof Error && (error.message === "NOT_FOUND" || error.message === "FORBIDDEN")) {
    return { ok: false, code: "NOT_FOUND", message: "Рецепт не найден или недоступен для копирования." };
  }
  if (error instanceof Error && error.message === "RATE_LIMITED") {
    return { ok: false, code: "ERROR", message: "Слишком много копирований подряд. Попробуйте позже." };
  }
  if (error instanceof Error && error.message === "RECIPE_QUOTA_REACHED") {
    return { ok: false, code: "ERROR", message: "Достигнут предел числа рецептов. Удалите ненужные, чтобы копировать новые." };
  }
  return { ok: false, code: "ERROR", message: "Не удалось скопировать рецепт. Попробуйте ещё раз." };
};

/**
 * Мост «сохранённое/публичное → мои рецепты». Клонирует ЧУЖОЙ published-рецепт
 * (или свой) в новый черновик во владении текущего пользователя и возвращает его
 * id для редиректа в редактор. userId берётся ТОЛЬКО из серверной сессии —
 * клиентскому payload не доверяем (в сигнатуре userId нет).
 */
export const cloneRecipeFromPublicAction = async (input: {
  recipeId: string;
  equipmentProfileId?: string | null;
  targetBatchVolumeLitres?: number | null;
  targetEfficiencyPct?: number | null;
}): Promise<RecipeCloneActionResult> => {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, code: "AUTH", message: "Войдите, чтобы скопировать рецепт." };
  }

  const parsed = cloneInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "NOT_FOUND", message: "Рецепт не найден или недоступен для копирования." };
  }

  try {
    // Антиспам: копирование создаёт записи во владении юзера, ограничиваем частоту.
    await assertRateLimit(user.id, "recipe_clone", 10, 60 * 60);
    const recipe = await cloneRecipeFromPublic(user.id, parsed.data.recipeId, {
      targetBatchVolumeLitres: parsed.data.targetBatchVolumeLitres ?? null,
      targetEfficiencyPct: parsed.data.targetEfficiencyPct ?? null,
      ...(parsed.data.equipmentProfileId ? { equipmentProfileId: parsed.data.equipmentProfileId } : {})
    });
    revalidatePath("/app/recipes");
    return { ok: true, recipeId: recipe.id };
  } catch (error) {
    return mapCloneError(error);
  }
};
