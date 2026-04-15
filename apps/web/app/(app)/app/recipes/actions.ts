"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import type { IngredientCategory, IngredientSuggestionItem, IngredientTechnicalData, IngredientType } from "@/features/ingredients/contracts";
import type { EquipmentProfileSnapshot } from "@/features/equipment-profiles/contracts";
import { getEquipmentProfileSnapshot } from "@/features/equipment-profiles/service";
import type { RecipeCalculationMeta, RecipeDetailDto, RecipeInventoryIntentMode, RecipeInventorySelectionMeta, RecipeStockCoverageDto, RecipeWaterPlanMeta } from "@/features/recipes/contracts";
import type { RecipeDraftPreviewDto } from "@/features/recipes/contracts";
import { cloneRecipe, createRecipe, createRecipeVersion, deleteRecipe, getOwnedRecipeById, previewRecipeDraft, updateRecipe } from "@/features/recipes/service";
import {
  consumeRecipeInventoryAllocations,
  listRecipeStockCoverage,
  releaseRecipeInventoryAllocations,
  reserveRecipeInventoryAllocations,
  syncRecipeSelectedInventoryAllocations
} from "@/features/recipes/inventory-service";
import { createBrewBatchFromRecipe } from "@/features/brew-batches/service";
import { exportRecipeToBeerXml, importBeerXmlToCanonicalRecipe } from "@/features/recipes/interop/beerxml";
import { importBrewfatherJsonToCanonicalRecipe } from "@/features/recipes/interop/brewfather-json";
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
  calculationMeta?: RecipeCalculationMeta | null;
  draftState?: Record<string, unknown> | null;
  importMeta?: Record<string, unknown> | null;
  equipmentProfileId?: string | null;
  equipmentProfileSnapshot?: EquipmentProfileSnapshot | null;
  waterPlanMeta?: RecipeWaterPlanMeta | null;
  brewPlanMeta?: Record<string, unknown> | null;
  ingredients: Array<{
    persistentKey?: string | null;
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
    inventoryIntentMode?: RecipeInventoryIntentMode | null;
    inventorySelectionMeta?: RecipeInventorySelectionMeta | null;
    externalImportMeta?: Record<string, unknown> | null;
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

const mapRecipeImportError = (error: unknown, formatLabel: string): RecipeEditorResult => {
  if (error instanceof Error) {
    if (error.message === "EMPTY_BEERXML") {
      return { ok: false, message: "BeerXML пустой. Загрузите файл или вставьте XML перед импортом." };
    }

    if (error.message === "INVALID_BEERXML") {
      return { ok: false, message: "BeerXML не распознан: в файле не найден блок RECIPE." };
    }

    if (error.message === "INVALID_BREWFATHER_JSON") {
      return { ok: false, message: "Brewfather JSON не распознан: проверьте, что выбран экспорт рецепта из Brewfather." };
    }

    if (error.message === "INVALID_IMPORT_RECIPE") {
      return { ok: false, message: `${formatLabel}: в импортируемом рецепте не найдено название.` };
    }

    if (error.message === "IMPORT_RECIPE_EMPTY") {
      return { ok: false, message: `${formatLabel}: в рецепте не найдены ингредиенты для импорта.` };
    }

    if (error.message === "INVALID_IMPORT_INGREDIENT_AMOUNT") {
      return { ok: false, message: `${formatLabel}: у одного из ингредиентов нет корректного количества.` };
    }

    if (error.message === "IMPORTED_CUSTOM_NAME_CONFLICT") {
      return {
        ok: false,
        message: `${formatLabel}: не удалось подобрать уникальное имя для одного из импортируемых ингредиентов. Переименуйте похожий собственный ингредиент или попробуйте импорт еще раз.`
      };
    }

    if (error.message.includes("user_custom_ingredients_user_type_name_uidx")) {
      return { ok: false, message: `${formatLabel}: импорт не выполнен, потому что один из импортируемых ингредиентов уже есть среди ваших собственных ингредиентов.` };
    }
  }

  const mapped = mapRecipeEditorError(error);
  const genericMessage = "Не удалось сохранить рецепт. Попробуйте еще раз.";
  return {
    ...mapped,
    message: mapped.message === genericMessage
      ? `${formatLabel}: импорт не выполнен. Проверьте файл и попробуйте еще раз.`
      : `${formatLabel}: ${mapped.message}`
  };
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

const readCustomPhysicalFormFromTechnicalData = (technicalData?: IngredientTechnicalData | null) => {
  if (!technicalData || (technicalData.type !== "consumable" && technicalData.type !== "water_treatment")) {
    return null;
  }

  const commonForms = Array.isArray(technicalData.commonForms) ? technicalData.commonForms : [];
  const first = commonForms.find((value) => typeof value === "string" && value.trim());
  return first ?? null;
};

const readCustomConcentrationFromTechnicalData = (technicalData?: IngredientTechnicalData | null) => {
  if (!technicalData) {
    return null;
  }

  if (technicalData.type === "water_treatment") {
    return typeof technicalData.typicalUseRu === "string" ? technicalData.typicalUseRu : null;
  }

  if (technicalData.type === "consumable") {
    const reference = technicalData.dosageReference;
    if (reference && typeof reference === "object" && !Array.isArray(reference)) {
      const referenceRecord = reference as Record<string, unknown>;
      return typeof referenceRecord.label === "string" ? referenceRecord.label : null;
    }
  }

  return null;
};

export const createRecipeCustomIngredientAction = async (payload: {
  category: IngredientCategory;
  subtype?: string | null;
  displayName: string;
  defaultDisplayUnit: string;
  technicalData?: IngredientTechnicalData | null;
}): Promise<RecipeCustomIngredientResult> => {
  try {
    const user = await requireUser();
    const [
      { buildCustomIngredientLinkage },
      { resolveLegacyIngredientType },
      { createUserCustomInventoryIngredient },
      { extractIngredientTechnicalFields, lovibondToEbc }
    ] = await Promise.all([
      import("@/features/ingredients/source-linkage"),
      import("@/features/ingredients/taxonomy"),
      import("@/features/inventory/service"),
      import("@/features/ingredients/technical-fields")
    ]);
    const resolvedType = resolveLegacyIngredientType({
      category: payload.category,
      subtype: payload.subtype ?? undefined
    }) ?? payload.technicalData?.type ?? undefined;
    const technicalFields = payload.technicalData && resolvedType
      ? extractIngredientTechnicalFields({ type: resolvedType, technicalData: payload.technicalData })
      : {};
    const customIngredient = await createUserCustomInventoryIngredient(user.id, {
      category: payload.category,
      type: resolvedType,
      subtype: payload.subtype ?? null,
      displayName: payload.displayName,
      defaultDisplayUnit: payload.defaultDisplayUnit,
      visibility: "private",
      fermentableColorEbc: lovibondToEbc(technicalFields.fermentableColorLovibond),
      fermentableExtractYieldPct: technicalFields.fermentableExtractYieldPct ?? null,
      hopAlphaAcidPct: technicalFields.hopAlphaAcidPct ?? null,
      hopBetaAcidPct: technicalFields.hopBetaAcidPct ?? null,
      hopForm: technicalFields.hopForm ?? null,
      yeastAttenuationPct: technicalFields.yeastAttenuationPct ?? null,
      yeastForm: technicalFields.yeastForm ?? null,
      yeastMinFermentationTempC: technicalFields.yeastMinFermentationTempC ?? null,
      yeastMaxFermentationTempC: technicalFields.yeastMaxFermentationTempC ?? null,
      physicalForm: readCustomPhysicalFormFromTechnicalData(payload.technicalData),
      concentration: readCustomConcentrationFromTechnicalData(payload.technicalData)
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

export type RecipeInventoryActionResult = {
  ok: boolean;
  message: string;
  coverage?: RecipeStockCoverageDto;
};

export type RecipeEquipmentProfileSnapshotResult = {
  ok: boolean;
  message: string;
  snapshot?: EquipmentProfileSnapshot;
};

export const getEquipmentProfileSnapshotAction = async (
  profileId: string
): Promise<RecipeEquipmentProfileSnapshotResult> => {
  try {
    const user = await requireUser();
    return {
      ok: true,
      message: "Equipment profile snapshot обновлен.",
      snapshot: await getEquipmentProfileSnapshot(user.id, profileId)
    };
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { ok: false, message: "Equipment profile не найден." };
    }

    return { ok: false, message: "Не удалось обновить equipment profile snapshot." };
  }
};

const runRecipeInventoryAction = async (
  recipeId: string,
  action: (userId: string, recipeId: string) => Promise<RecipeStockCoverageDto>,
  successMessage: string
): Promise<RecipeInventoryActionResult> => {
  try {
    const user = await requireUser();
    const coverage = await action(user.id, recipeId);

    revalidatePath("/app/recipes");
    revalidatePath(`/app/recipes/${recipeId}`);
    revalidatePath(`/app/recipes/${recipeId}/edit`);

    return {
      ok: true,
      message: successMessage,
      coverage
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return { ok: false, message: "Рецепт или складская позиция не найдены." };
      }

      if (error.message === "INCOMPATIBLE_INVENTORY_SOURCE") {
        return { ok: false, message: "Складская позиция не совпадает с ингредиентом рецепта." };
      }

      if (error.message === "INCOMPATIBLE_UNIT") {
        return { ok: false, message: "Единицы рецепта и склада несовместимы." };
      }

      if (error.message === "INSUFFICIENT_STOCK") {
        return { ok: false, message: "На складе недостаточно остатка для списания." };
      }
    }

    return { ok: false, message: "Не удалось выполнить действие со складом." };
  }
};

export const syncRecipeInventoryAllocationsAction = async (recipeId: string) => (
  runRecipeInventoryAction(recipeId, syncRecipeSelectedInventoryAllocations, "Складские позиции подобраны для рецепта.")
);

export const reserveRecipeInventoryAction = async (recipeId: string) => (
  runRecipeInventoryAction(recipeId, reserveRecipeInventoryAllocations, "Ингредиенты зарезервированы.")
);

export const consumeRecipeInventoryAction = async (recipeId: string) => (
  runRecipeInventoryAction(recipeId, consumeRecipeInventoryAllocations, "Ингредиенты списаны со склада.")
);

export const releaseRecipeInventoryAction = async (recipeId: string) => (
  runRecipeInventoryAction(recipeId, releaseRecipeInventoryAllocations, "Резерв снят.")
);

export const getRecipeStockCoverageAction = async (recipeId: string): Promise<RecipeInventoryActionResult> => {
  try {
    const user = await requireUser();
    return {
      ok: true,
      message: "Покрытие склада обновлено.",
      coverage: await listRecipeStockCoverage(user.id, recipeId)
    };
  } catch {
    return { ok: false, message: "Не удалось обновить покрытие склада." };
  }
};

export const createBrewBatchFromRecipeAction = async (
  recipeId: string
): Promise<{ ok: boolean; message: string; brewBatchId?: string }> => {
  try {
    const user = await requireUser();
    const batch = await createBrewBatchFromRecipe(user.id, recipeId);

    revalidatePath("/app/recipes");
    revalidatePath(`/app/recipes/${recipeId}`);
    revalidatePath(`/app/recipes/${recipeId}/edit`);

    return {
      ok: true,
      message: "Партия варки создана.",
      brewBatchId: batch.id
    };
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { ok: false, message: "Рецепт не найден." };
    }

    return { ok: false, message: "Не удалось создать партию варки." };
  }
};

export const exportRecipeBeerXmlAction = async (
  recipeId: string
): Promise<{ ok: boolean; message: string; beerXml?: string }> => {
  try {
    const user = await requireUser();
    const recipe = await getOwnedRecipeById(user.id, recipeId);
    return {
      ok: true,
      message: "BeerXML экспорт подготовлен.",
      beerXml: exportRecipeToBeerXml(recipe)
    };
  } catch {
    return { ok: false, message: "Не удалось подготовить BeerXML экспорт." };
  }
};

export const importBeerXmlRecipeAction = async (
  beerXml: string
): Promise<RecipeEditorResult> => {
  try {
    const user = await requireUser();
    const { createRecipeFromCanonicalImport } = await import("@/features/recipes/interop/import-service");
    const canonical = importBeerXmlToCanonicalRecipe(beerXml);
    const recipe = await createRecipeFromCanonicalImport(user.id, canonical);

    revalidatePath("/app/recipes");
    revalidatePath(`/app/recipes/${recipe.id}`);
    revalidatePath(`/app/recipes/${recipe.id}/edit`);

    return {
      ok: true,
      message: "BeerXML рецепт импортирован.",
      recipe
    };
  } catch (error) {
    return mapRecipeImportError(error, "BeerXML");
  }
};

export const importBrewfatherJsonRecipeAction = async (
  payload: unknown
): Promise<RecipeEditorResult> => {
  try {
    const user = await requireUser();
    const { createRecipeFromCanonicalImport } = await import("@/features/recipes/interop/import-service");
    const canonical = importBrewfatherJsonToCanonicalRecipe(payload);
    const recipe = await createRecipeFromCanonicalImport(user.id, canonical);

    revalidatePath("/app/recipes");
    revalidatePath(`/app/recipes/${recipe.id}`);
    revalidatePath(`/app/recipes/${recipe.id}/edit`);

    return {
      ok: true,
      message: "Brewfather JSON импортирован.",
      recipe
    };
  } catch (error) {
    return mapRecipeImportError(error, "Brewfather JSON");
  }
};
