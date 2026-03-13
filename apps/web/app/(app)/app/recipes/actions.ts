"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import type { RecipeDetailDto } from "@/features/recipes/contracts";
import { createRecipe, deleteRecipe, updateRecipe } from "@/features/recipes/service";
import { requireUser } from "@/lib/auth";

export type RecipeEditorPayload = {
  title: string;
  description?: string | null;
  authorNotes?: string | null;
  publicationState: "draft" | "private" | "published";
  batchSizeEnteredQuantity: number;
  batchSizeEnteredUnit: string;
  efficiency?: number | null;
  ingredients: Array<{
    ingredientCatalogItemId?: string | null;
    userCustomIngredientId?: string | null;
    type?: "fermentable" | "hop" | "yeast" | "sugar" | "adjunct" | "fining" | "misc";
    category?: "fermentable" | "hop" | "yeast" | "water_prep" | "misc";
    subtype?: string | null;
    familyId?: string | null;
    amountEnteredQuantity: number;
    amountEnteredUnit: string;
    stage: "mash" | "boil" | "whirlpool" | "fermentation" | "packaging" | "other";
    timeOffset?: number | null;
  }>;
};

export type RecipeEditorResult = {
  ok: boolean;
  message: string;
  recipe?: RecipeDetailDto;
  fieldErrors?: Record<string, string>;
};

const mapRecipeEditorError = (error: unknown): RecipeEditorResult => {
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "form";
      if (!fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }

    return {
      ok: false,
      message: "Проверьте заполнение формы рецепта.",
      fieldErrors
    };
  }

  if (error instanceof Error) {
    if (error.message === "NOT_FOUND") {
      return { ok: false, message: "Рецепт не найден или недоступен для редактирования." };
    }

    if (["INVALID_UNIT", "INCOMPATIBLE_UNIT", "INVALID_BATCH_SIZE_UNIT"].includes(error.message)) {
      return { ok: false, message: "Проверьте единицы измерения: найдены некорректные значения." };
    }

    if (["CATALOG_INGREDIENT_NOT_FOUND", "CUSTOM_INGREDIENT_NOT_FOUND"].includes(error.message)) {
      return { ok: false, message: "Один или несколько ингредиентов больше недоступны." };
    }

    if (error.message === "INGREDIENT_TYPE_MISMATCH") {
      return { ok: false, message: "Тип ингредиента не совпадает с выбранным источником." };
    }
    if (error.message === "INGREDIENT_LINKAGE_MISMATCH") {
      return { ok: false, message: "Выбранный ингредиент больше не совпадает с текущей taxonomy-связкой." };
    }
  }

  return { ok: false, message: "Не удалось сохранить рецепт. Попробуйте еще раз." };
};

export const createRecipeAction = async (payload: RecipeEditorPayload): Promise<RecipeEditorResult> => {
  try {
    const user = await requireUser();
    const recipe = await createRecipe(user.id, payload);

    revalidatePath("/app/recipes");
    revalidatePath(`/app/recipes/${recipe.id}`);
    revalidatePath(`/app/recipes/${recipe.id}/edit`);

    return {
      ok: true,
      message: "Рецепт создан и статистика пересчитана.",
      recipe
    };
  } catch (error) {
    return mapRecipeEditorError(error);
  }
};

export const updateRecipeAction = async (recipeId: string, payload: RecipeEditorPayload): Promise<RecipeEditorResult> => {
  try {
    const user = await requireUser();
    const recipe = await updateRecipe(user.id, recipeId, {
      ...payload,
      recomputeStats: true
    });

    revalidatePath("/app/recipes");
    revalidatePath(`/app/recipes/${recipe.id}`);
    revalidatePath(`/app/recipes/${recipe.id}/edit`);

    return {
      ok: true,
      message: "Рецепт обновлен.",
      recipe
    };
  } catch (error) {
    return mapRecipeEditorError(error);
  }
};

export const deleteRecipeAction = async (recipeId: string): Promise<{ ok: boolean; message: string }> => {
  try {
    const user = await requireUser();
    const recipe = await deleteRecipe(user.id, recipeId);

    revalidatePath("/app/recipes");
    revalidatePath(`/app/recipes/${recipe.id}`);
    revalidatePath(`/app/recipes/${recipe.id}/edit`);
    revalidatePath("/recipes");
    if (recipe.slug) {
      revalidatePath(`/recipes/${recipe.slug}`);
    }

    return { ok: true, message: "Рецепт удален." };
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { ok: false, message: "Рецепт не найден или уже недоступен." };
    }

    return { ok: false, message: "Не удалось удалить рецепт. Попробуйте еще раз." };
  }
};
