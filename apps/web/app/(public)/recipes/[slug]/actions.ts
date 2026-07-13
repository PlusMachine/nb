"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { recordAuditEvent } from "@/features/audit/service";
import { invalidateHomeDataCache } from "@/features/home/home-data-cache";
import type { RecipeRatingDto, RecipeRatingSummary } from "@/features/recipes/contracts";
import {
  deleteRecipeRating,
  getRecipeFeaturedState,
  getViewerRecipeRatingState,
  rateRecipe,
  setRecipeFeatured
} from "@/features/recipes/service";
import { getSessionUser, hasRequiredRole } from "@/lib/auth";
import { assertRateLimit } from "@nb/auth";

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
    if (error.message === "RATE_LIMITED") {
      return { ok: false, code: "ERROR", message: "Слишком много оценок подряд. Попробуйте позже." };
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
    // Антиспам: оценка с текстом — публичный контент, ограничиваем частоту на юзера.
    await assertRateLimit(user.id, "recipe_rating", 20, 10 * 60);
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

// ─── «Выбор редакции» (кураторская метка, роль editor+) ──────────────────────

/** Состояние тумблера «Выбор редакции», тянется клиентом после гидрации (чтобы
 *  документ страницы не читал cookie и оставался кэшируемым). Обычному
 *  пользователю `canFeature=false` → тумблер не рендерится. */
export type RecipeFeatureControlState = {
  canFeature: boolean;
  featured: boolean;
};

export const loadRecipeFeatureControl = async (recipeId: string): Promise<RecipeFeatureControlState> => {
  const user = await getSessionUser();
  if (!user || !hasRequiredRole(user.role, "editor")) {
    return { canFeature: false, featured: false };
  }
  const state = await getRecipeFeaturedState(recipeId);
  // Тумблер доступен для published (снять метку можно и с непубличного — на случай
  // снятия с публикации после отметки).
  return { canFeature: state.exists && (state.published || state.featured), featured: state.featured };
};

export type RecipeFeatureActionResult =
  | { ok: true; featured: boolean }
  | { ok: false; message: string };

/** Ставит/снимает «Выбор редакции». Роль editor+ проверяется здесь; сервисный
 *  слой (`setRecipeFeatured`) валидирует published/существование. */
export const setRecipeFeaturedAction = async (input: {
  recipeId: string;
  slug: string;
  featured: boolean;
}): Promise<RecipeFeatureActionResult> => {
  const user = await getSessionUser();
  if (!user || !hasRequiredRole(user.role, "editor")) {
    return { ok: false, message: "Недостаточно прав." };
  }

  try {
    const result = await setRecipeFeatured(input.recipeId, input.featured);
    await recordAuditEvent({
      actorUserId: user.id,
      actorEmail: user.email,
      action: "recipe.editors_choice",
      entityType: "recipe",
      entityId: input.recipeId,
      summary: result.featured ? "«Выбор редакции» поставлен" : "«Выбор редакции» снят",
      payload: { featured: result.featured, slug: input.slug }
    });
    revalidatePath(`/recipes/${input.slug}`);
    revalidatePath("/recipes");
    revalidatePath("/admin/recipes");
    revalidatePath("/");
    // Бейдж «Выбор редакции» едет на карточках ленты главной, а лента лежит в
    // процессном TTL-слоте мимо Next-кэша (features/home/home-data-cache.ts).
    invalidateHomeDataCache();
    return { ok: true, featured: result.featured };
  } catch {
    return { ok: false, message: "Не удалось изменить «Выбор редакции»." };
  }
};
