"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { revalidatePublicRecipePages } from "@/features/recipes/revalidate-public-pages";
import {
  describeRecipeBulkFailures,
  groupRecipeBulkFailures,
  type RecipeBulkFailureGroup
} from "@/features/recipes/admin-page-model";
import { deleteRecipeAsModerator, hideRecipes, unhideRecipe } from "@/features/recipes/admin-service";
import { requireRole } from "@/lib/auth";

// Модерация рецептов (/admin/recipes) — по образцу app/(admin)/admin/masters/actions.ts:
// requireRole → сервис → revalidatePath → {ok:true}|{ok:false,error}. Аудит пишет
// сервисный слой (features/recipes/admin-service.ts), он же знает, что реально изменилось.

export type AdminRecipeActionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Частичный отказ — штатный исход массового скрытия: часть рецептов скрыта, часть
 * нет. Поэтому `failed` едет и в успешном варианте — иначе упавшие рецепты
 * потерялись бы за зелёным {ok:true} (тот же контракт, что у каталога).
 */
export type HideRecipesActionResult =
  | { ok: true; processed: number; failed: RecipeBulkFailureGroup[] }
  | { ok: false; error: string; failed?: RecipeBulkFailureGroup[] };

const firstZodMessage = (error: ZodError): string => error.issues[0]?.message ?? "Проверьте введённые данные.";

const ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "Рецепт не найден — возможно, страницу нужно обновить.",
  FORBIDDEN: "Недостаточно прав."
};

const mapRecipeModerationError = (error: unknown): { ok: false; error: string } => {
  // requireRole редиректит гостя/недостаточную роль — такой «редирект-как-ошибка»
  // нельзя проглатывать, иначе действие молча ничего не сделает.
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
  }

  if (error instanceof ZodError) {
    return { ok: false, error: firstZodMessage(error) };
  }

  if (error instanceof Error && ERROR_MESSAGES[error.message]) {
    return { ok: false, error: ERROR_MESSAGES[error.message] };
  }

  return { ok: false, error: "Не удалось выполнить операцию." };
};

/** Скрытие: и одиночное, и массовое — один экшен (обязательная причина). */
export const hideRecipesAction = async (
  recipeIds: string[],
  reason: string
): Promise<HideRecipesActionResult> => {
  try {
    const user = await requireRole("moderator");
    const targetIds = [...new Set(recipeIds.map((id) => id.trim()).filter(Boolean))];
    if (targetIds.length === 0) {
      return { ok: false, error: "Не выбрано ни одного рецепта." };
    }

    const result = await hideRecipes({ id: user.id, email: user.email }, targetIds, reason);
    revalidatePath("/admin/recipes");
    await revalidatePublicRecipePages(result.hidden);

    const failed = groupRecipeBulkFailures(result.failures);

    if (result.hidden.length === 0) {
      return {
        ok: false,
        error: failed.length > 0
          ? `Ничего не скрыто: ${describeRecipeBulkFailures(failed)}.`
          : "Ничего не скрыто.",
        failed
      };
    }

    return { ok: true, processed: result.hidden.length, failed };
  } catch (error) {
    return mapRecipeModerationError(error);
  }
};

export const unhideRecipeAction = async (recipeId: string): Promise<AdminRecipeActionResult> => {
  try {
    const user = await requireRole("moderator");
    const { slug, styleId } = await unhideRecipe({ id: user.id, email: user.email }, recipeId);
    revalidatePath("/admin/recipes");
    await revalidatePublicRecipePages([{ slug, styleId }]);
    return { ok: true };
  } catch (error) {
    return mapRecipeModerationError(error);
  }
};

export const deleteRecipeAction = async (recipeId: string): Promise<AdminRecipeActionResult> => {
  try {
    const user = await requireRole("moderator");
    const { slug, styleId } = await deleteRecipeAsModerator({ id: user.id, email: user.email }, recipeId);
    revalidatePath("/admin/recipes");
    await revalidatePublicRecipePages([{ slug, styleId }]);
    return { ok: true };
  } catch (error) {
    return mapRecipeModerationError(error);
  }
};
