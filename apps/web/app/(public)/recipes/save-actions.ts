"use server";

import { revalidatePath } from "next/cache";

import type { RecipeSaveSummary } from "@/features/recipes/contracts";
import { getSavedRecipeIds, getViewerRecipeSaveState, setRecipeSave } from "@/features/recipes/service";
import { getSessionUser } from "@/lib/auth";

export type RecipeSaveActionResult =
  | { ok: true; saved: boolean; count: number }
  | { ok: false; code: "AUTH" | "NOT_FOUND" | "ERROR"; message: string };

/** Персональное состояние сохранения для детальной страницы (тянется клиентом
 *  после гидрации, чтобы документ `/recipes/[slug]` оставался кэшируемым). */
export type RecipeSaveViewerState = {
  authenticated: boolean;
  saved: boolean;
};

const mapSaveError = (error: unknown): RecipeSaveActionResult => {
  if (error instanceof Error && (error.message === "NOT_FOUND" || error.message === "FORBIDDEN")) {
    return { ok: false, code: "NOT_FOUND", message: "Рецепт не найден или недоступен для сохранения." };
  }
  return { ok: false, code: "ERROR", message: "Не удалось сохранить рецепт. Попробуйте ещё раз." };
};

/**
 * Сохраняет/снимает рецепт в «Избранных» текущего пользователя. userId берётся
 * ТОЛЬКО на сервере из сессии — клиентскому payload не доверяем.
 */
export const toggleRecipeSaveAction = async (input: {
  recipeId: string;
  slug?: string;
  next: boolean;
}): Promise<RecipeSaveActionResult> => {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, code: "AUTH", message: "Войдите, чтобы сохранять рецепты." };
  }

  try {
    const summary: RecipeSaveSummary = await setRecipeSave(user.id, input.recipeId, input.next);
    revalidatePath("/recipes");
    revalidatePath("/app/saved");
    if (input.slug) {
      revalidatePath(`/recipes/${input.slug}`);
    }
    return { ok: true, saved: summary.saved, count: summary.count };
  } catch (error) {
    return mapSaveError(error);
  }
};

/** Состояние сохранения для текущего пользователя (детальная страница). */
export const loadRecipeSaveViewerState = async (recipeId: string): Promise<RecipeSaveViewerState> => {
  const user = await getSessionUser();
  if (!user) {
    return { authenticated: false, saved: false };
  }

  const { saved } = await getViewerRecipeSaveState(user.id, recipeId);
  return { authenticated: true, saved };
};

/**
 * Батч: какие из видимых рецептов сохранены текущим пользователем. Витрина
 * вызывает это после гидрации и раздаёт состояние флажкам через контекст.
 * Неавторизованному — пустой список.
 */
export const loadRecipeSaveStates = async (recipeIds: string[]): Promise<string[]> => {
  const user = await getSessionUser();
  if (!user) {
    return [];
  }

  const saved = await getSavedRecipeIds(user.id, recipeIds);
  return [...saved];
};
