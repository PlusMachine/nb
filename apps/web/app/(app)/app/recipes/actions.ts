"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import type { IngredientCategory, IngredientSuggestionItem, IngredientType } from "@/features/ingredients/contracts";
import type { RecipeDetailDto } from "@/features/recipes/contracts";
import type { RecipeDraftPreviewDto } from "@/features/recipes/contracts";
import { cloneRecipe, createRecipe, createRecipeVersion, deleteRecipe, previewRecipeDraft, updateRecipe } from "@/features/recipes/service";
import { requireUser } from "@/lib/auth";

export type RecipeEditorPayload = {
  title: string;
  styleId?: string | null;
  description?: string | null;
  authorNotes?: string | null;
  publicationState: "draft" | "private" | "published";
  batchSizeEnteredQuantity: number;
  batchSizeEnteredUnit: string;
  efficiency?: number | null;
  boilTimeMinutes: number;
  processMeta?: Record<string, unknown> | null;
  ingredients: Array<{
    ingredientCatalogItemId?: string | null;
    userCustomIngredientId?: string | null;
    type?: IngredientType;
    category?: IngredientCategory;
    subtype?: string | null;
    familyId?: string | null;
    amountEnteredQuantity: number;
    amountEnteredUnit: string;
    stage: "mash" | "boil" | "whirlpool" | "fermentation" | "packaging" | "other";
    timeOffset?: number | null;
    stepMeta?: Record<string, unknown> | null;
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
    if (error.name === "RecipeValidationError" && "fieldErrors" in error) {
      return {
        ok: false,
        message: error.message,
        fieldErrors: (error as Error & { fieldErrors?: Record<string, string> }).fieldErrors
      };
    }

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

export type RecipePreviewResult = {
  ok: boolean;
  message?: string;
  preview?: RecipeDraftPreviewDto;
  fieldErrors?: Record<string, string>;
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

export const cloneRecipeAction = async (recipeId: string): Promise<RecipeEditorResult> => {
  try {
    const user = await requireUser();
    const recipe = await cloneRecipe(user.id, recipeId);

    revalidatePath("/app/recipes");
    revalidatePath(`/app/recipes/${recipe.id}`);
    revalidatePath(`/app/recipes/${recipe.id}/edit`);

    return {
      ok: true,
      message: "Рецепт клонирован.",
      recipe
    };
  } catch (error) {
    return mapRecipeEditorError(error);
  }
};

export const createRecipeVersionAction = async (recipeId: string): Promise<RecipeEditorResult> => {
  try {
    const user = await requireUser();
    const recipe = await createRecipeVersion(user.id, recipeId);

    revalidatePath("/app/recipes");
    revalidatePath(`/app/recipes/${recipe.id}`);
    revalidatePath(`/app/recipes/${recipe.id}/edit`);

    return {
      ok: true,
      message: "Новая версия рецепта создана.",
      recipe
    };
  } catch (error) {
    return mapRecipeEditorError(error);
  }
};

export const previewRecipeDraftAction = async (payload: Partial<RecipeEditorPayload>): Promise<RecipePreviewResult> => {
  try {
    const user = await requireUser();
    const preview = await previewRecipeDraft(user.id, payload);
    return { ok: true, preview };
  } catch (error) {
    const mapped = mapRecipeEditorError(error);
    return {
      ok: false,
      message: mapped.message,
      fieldErrors: mapped.fieldErrors
    };
  }
};

export type RecipeCustomIngredientResult = {
  ok: boolean;
  message: string;
  item?: IngredientSuggestionItem;
  fieldErrors?: Record<string, string>;
};

export const createRecipeCustomIngredientAction = async (payload: {
  category: IngredientCategory;
  subtype?: string | null;
  displayName: string;
  defaultDisplayUnit: string;
}): Promise<RecipeCustomIngredientResult> => {
  try {
    const user = await requireUser();
    const [{ buildCustomIngredientLinkage }, { resolveLegacyIngredientType }, { createUserCustomInventoryIngredient }] = await Promise.all([
      import("@/features/ingredients/source-linkage"),
      import("@/features/ingredients/taxonomy"),
      import("@/features/inventory/service")
    ]);
    const customIngredient = await createUserCustomInventoryIngredient(user.id, {
      category: payload.category,
      type: resolveLegacyIngredientType({
        category: payload.category,
        subtype: payload.subtype ?? undefined
      }) ?? undefined,
      subtype: payload.subtype ?? null,
      displayName: payload.displayName,
      defaultDisplayUnit: payload.defaultDisplayUnit,
      visibility: "private"
    });
    revalidatePath("/app/catalog");
    const linkage = buildCustomIngredientLinkage(customIngredient);

    return {
      ok: true,
      message: "Собственный ингредиент создан.",
      item: {
        id: customIngredient.id,
        type: linkage.type,
        category: linkage.category,
        subtype: linkage.subtype,
        displayName: customIngredient.displayName,
        subtitle: linkage.summary ?? "Собственный ингредиент",
        defaultUnit: linkage.defaultDisplayUnit,
        defaultDisplayUnit: linkage.defaultDisplayUnit,
        allowedUnits: linkage.allowedUnits,
        measurementDimension: linkage.measurementDimension,
        technicalData: linkage.technicalData,
        source: "custom"
      }
    };
  } catch (error) {
    const mapped = mapRecipeEditorError(error);
    return {
      ok: false,
      message: mapped.message,
      fieldErrors: mapped.fieldErrors
    };
  }
};

export const proposeRecipeIngredientAction = async (payload: {
  displayName: string;
  category: IngredientCategory;
  subtype?: string | null;
}): Promise<{ ok: boolean; message: string }> => {
  try {
    const user = await requireUser();
    const { createProposedIngredient } = await import("@/features/ingredients/service");
    await createProposedIngredient({
      submittedByUserId: user.id,
      sourceType: "recipe_designer",
      sourceDisplayName: payload.displayName,
      sourcePayload: {
        category: payload.category,
        subtype: payload.subtype ?? null
      }
    });

    return {
      ok: true,
      message: "Ингредиент отправлен в каталог на рассмотрение."
    };
  } catch {
    return {
      ok: false,
      message: "Не удалось отправить ингредиент в каталог. Попробуйте ещё раз."
    };
  }
};
