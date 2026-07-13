"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { CUSTOM_INGREDIENT_MAX_COUNT_PER_USER, createUserCustomIngredientSchema } from "@/features/inventory/contracts";
import {
  createUserCustomIngredient,
  deleteUserCustomIngredient,
  updateUserCustomIngredient
} from "@/features/inventory/service";
import { requireUser } from "@/lib/auth";

export type CatalogCustomIngredientActionResult = {
  ok: boolean;
  message: string;
  ingredientId?: string;
  fieldErrors?: Record<string, string>;
};

const mapCatalogCustomIngredientError = (error: unknown): CatalogCustomIngredientActionResult => {
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }

    return {
      ok: false,
      message: "Проверьте заполнение карточки ингредиента.",
      fieldErrors
    };
  }

  if (error instanceof Error) {
    if (error.message === "CUSTOM_INGREDIENT_NOT_FOUND") {
      return {
        ok: false,
        message: "Пользовательский ингредиент не найден."
      };
    }

    if (error.message === "CUSTOM_INGREDIENT_IN_USE") {
      return {
        ok: false,
        message: "Ингредиент уже используется в складе или рецептах и не может быть удалён."
      };
    }

    if (error.message === "RATE_LIMITED") {
      return {
        ok: false,
        message: "Слишком много новых ингредиентов подряд. Попробуйте позже."
      };
    }

    if (error.message === "CUSTOM_INGREDIENT_QUOTA_REACHED") {
      return {
        ok: false,
        message: `Достигнут предел числа собственных ингредиентов (${CUSTOM_INGREDIENT_MAX_COUNT_PER_USER}). Удалите ненужные, чтобы создавать новые.`
      };
    }
  }

  return {
    ok: false,
    message: "Не удалось сохранить ингредиент. Попробуйте ещё раз."
  };
};

const revalidateCatalogPaths = (ingredientId?: string) => {
  revalidatePath("/catalog");
  revalidatePath("/app/ingredients");
  revalidatePath("/app/recipes");

  if (ingredientId) {
    revalidatePath(`/catalog/custom/${ingredientId}`);
    revalidatePath(`/catalog/custom/${ingredientId}/edit`);
  }
};

export const createCatalogCustomIngredientAction = async (
  payload: unknown
): Promise<CatalogCustomIngredientActionResult> => {
  try {
    const user = await requireUser();
    // Антиспам-барьер (rate limit + квота) теперь внутри createUserCustomIngredient —
    // общий для всех входов, поэтому здесь отдельный assertRateLimit не нужен.
    const parsed = createUserCustomIngredientSchema.parse(payload);
    const created = await createUserCustomIngredient(user.id, parsed);
    revalidateCatalogPaths(created.id);

    return {
      ok: true,
      message: "Ингредиент сохранён в «Пользовательские ингредиенты».",
      ingredientId: created.id
    };
  } catch (error) {
    return mapCatalogCustomIngredientError(error);
  }
};

export const updateCatalogCustomIngredientAction = async (
  ingredientId: string,
  payload: unknown
): Promise<CatalogCustomIngredientActionResult> => {
  try {
    const user = await requireUser();
    const parsed = createUserCustomIngredientSchema.parse(payload);
    const updated = await updateUserCustomIngredient(user.id, ingredientId, parsed);
    revalidateCatalogPaths(updated.id);

    return {
      ok: true,
      message: "Ингредиент обновлён.",
      ingredientId: updated.id
    };
  } catch (error) {
    return mapCatalogCustomIngredientError(error);
  }
};

export const deleteCatalogCustomIngredientAction = async (
  ingredientId: string
): Promise<CatalogCustomIngredientActionResult> => {
  try {
    const user = await requireUser();
    await deleteUserCustomIngredient(user.id, ingredientId);
    revalidateCatalogPaths(ingredientId);

    return {
      ok: true,
      message: "Ингредиент удалён."
    };
  } catch (error) {
    return mapCatalogCustomIngredientError(error);
  }
};
