"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import type { RecipeRatingDto, RecipeRatingSummary } from "@/features/recipes/contracts";
import { deleteRecipeRating, getViewerRecipeRatingState, rateRecipe } from "@/features/recipes/service";
import { getSessionUser } from "@/lib/auth";

export type RecipeRatingActionResult =
  | { ok: true; rating: RecipeRatingSummary }
  | { ok: false; code: "AUTH" | "OWN_RECIPE" | "NOT_FOUND" | "INVALID" | "ERROR"; message: string };

/** Персональное состояние оценивания, тянется клиентом после гидрации (чтобы
 *  документ `/recipes/[slug]` не читал cookie и оставался кэшируемым). */
export type RecipeRatingViewerState = {
  authenticated: boolean;
  canRate: boolean;
  rating: RecipeRatingDto | null;
};

/**
 * Возвращает состояние оценивания для текущего пользователя. userId берётся
 * ТОЛЬКО на сервере из сессии. Вызывается из клиентского `recipe-rating-form`
 * после гидрации — поэтому сам документ страницы не де-кэшируется чтением cookie.
 */
export const loadRecipeRatingViewerState = async (recipeId: string): Promise<RecipeRatingViewerState> => {
  const user = await getSessionUser();
  if (!user) {
    return { authenticated: false, canRate: false, rating: null };
  }

  const { canRate, rating } = await getViewerRecipeRatingState(user.id, recipeId);
  return { authenticated: true, canRate, rating };
};

const mapRatingError = (error: unknown): RecipeRatingActionResult => {
  if (error instanceof ZodError) {
    return { ok: false, code: "INVALID", message: "Оценка должна быть от 1 до 5 звёзд." };
  }
  if (error instanceof Error) {
    if (error.message === "OWN_RECIPE") {
      return { ok: false, code: "OWN_RECIPE", message: "Нельзя оценивать собственный рецепт." };
    }
    if (error.message === "NOT_FOUND" || error.message === "FORBIDDEN") {
      return { ok: false, code: "NOT_FOUND", message: "Рецепт не найден или недоступен для оценки." };
    }
  }
  return { ok: false, code: "ERROR", message: "Не удалось сохранить оценку. Попробуйте ещё раз." };
};

/**
 * Ставит/обновляет оценку текущего пользователя (Phase D, §3.4). userId берётся
 * ТОЛЬКО на сервере из сессии — клиентскому payload не доверяем. Доменные
 * проверки (own-recipe, published, валидация) — в `rateRecipe`.
 */
export const rateRecipeAction = async (input: {
  recipeId: string;
  slug: string;
  stars: number;
  body?: string | null;
}): Promise<RecipeRatingActionResult> => {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, code: "AUTH", message: "Войдите, чтобы оценить рецепт." };
  }

  try {
    const rating = await rateRecipe(user.id, input.recipeId, { stars: input.stars, body: input.body ?? null });
    revalidatePath(`/recipes/${input.slug}`);
    revalidatePath("/recipes");
    return { ok: true, rating };
  } catch (error) {
    return mapRatingError(error);
  }
};

/** Удаляет оценку текущего пользователя. */
export const deleteRecipeRatingAction = async (input: {
  recipeId: string;
  slug: string;
}): Promise<RecipeRatingActionResult> => {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, code: "AUTH", message: "Войдите, чтобы изменить оценку." };
  }

  try {
    const rating = await deleteRecipeRating(user.id, input.recipeId);
    revalidatePath(`/recipes/${input.slug}`);
    revalidatePath("/recipes");
    return { ok: true, rating };
  } catch (error) {
    return mapRatingError(error);
  }
};
