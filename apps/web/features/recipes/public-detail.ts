import {
  readRecipeSourceAttribution,
  recipeCalculationMetaSchema,
  recipeProcessMetaSchema,
  recipeWaterPlanMetaSchema,
  type PublicRecipeDetailDto,
  type RecipeDetailDto,
  type RecipeIngredientDto
} from "./contracts";
import { equipmentProfileSnapshotSchema } from "../equipment-profiles/contracts";

const pick = <T, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> => (
  Object.fromEntries(keys.map((key) => [key, value[key]])) as Pick<T, K>
);

const publicIngredient = (line: RecipeIngredientDto): RecipeIngredientDto => {
  const needsSnapshot = line.inventoryIntentMode === "imported" || Boolean(line.userCustomIngredientId);
  const stepMeta = Object.fromEntries(Object.entries(line.stepMeta ?? {}).filter(([key, value]) => (
    ["use", "useType", "timeMinutes", "temperatureC", "durationDays", "fermentationTempC", "stageLabel", "alphaAcidPct"].includes(key)
    && (typeof value === "string" || (typeof value === "number" && Number.isFinite(value)))
  )));

  return {
    ...pick(line, [
      "id", "recipeId", "persistentKey", "displayOrder", "ingredientCatalogItemId",
      "type", "ingredientCategory", "ingredientSubtype", "ingredientFamilyId", "ingredientDisplayName",
      "ingredientDisplayNameRu", "ingredientDisplayNameEn", "ingredientDisplayNameSnapshot",
      "ingredientFamilyDisplayName", "ingredientSummary", "ingredientBrand", "ingredientProducer",
      "ingredientBrandName", "ingredientManufacturer", "ingredientCountryCode", "ingredientCountryName",
      "ingredientCountry", "ingredientDefaultDisplayUnit", "ingredientDefaultDisplayUnitSnapshot",
      "ingredientAllowedUnits", "ingredientMeasurementDimension", "ingredientMeasurementDimensionSnapshot",
      "ingredientTechnicalData", "amountEnteredQuantity", "amountEnteredUnit", "amountNormalizedQuantity",
      "amountNormalizedUnit", "stage", "timeOffset", "createdAt", "updatedAt"
    ]),
    stepMeta: Object.keys(stepMeta).length ? stepMeta : null,
    userCustomIngredientId: null,
    inventorySelectionMeta: null,
    inventoryIntentMode: needsSnapshot ? "imported" : null,
    // Для пересчёта/копирования импортированной строки нужен только её состав,
    // а не сырой импорт с произвольными полями и заметками исходного файла.
    externalImportMeta: needsSnapshot ? {
      importedIngredient: {
        version: 1,
        source: "published-recipe",
        name: line.ingredientDisplayName ?? line.ingredientDisplayNameSnapshot ?? "Ингредиент",
        type: line.type,
        category: line.ingredientCategory,
        subtype: line.ingredientSubtype,
        defaultDisplayUnit: line.ingredientDefaultDisplayUnit,
        allowedUnits: line.ingredientAllowedUnits,
        measurementDimension: line.ingredientMeasurementDimension,
        technicalData: line.ingredientTechnicalData
      }
    } : null
  };
};

/**
 * Явная проекция: добавление нового поля редактора не публикует его автоматически.
 * Вызывается на серверной границе для ЛЮБОГО читателя, кроме владельца.
 */
export const toPublicRecipeDetail = (recipe: RecipeDetailDto): PublicRecipeDetailDto => {
  const attribution = readRecipeSourceAttribution(recipe.importMeta);
  const equipment = recipe.equipmentProfileSnapshot
    ? equipmentProfileSnapshotSchema.parse(recipe.equipmentProfileSnapshot)
    : null;
  const water = recipe.waterPlanMeta ? recipeWaterPlanMetaSchema.parse(recipe.waterPlanMeta) : null;

  return {
    ...pick(recipe, [
      "id", "authorId", "recipeFamilyId", "versionNumber", "publicationState", "title", "slug", "styleId",
      "batchSizeEnteredQuantity", "batchSizeEnteredUnit", "batchSizeNormalizedQuantity", "batchSizeNormalizedUnit",
      "efficiency", "boilTimeMinutes", "og", "fg", "abv", "ibu", "color", "createdAt", "updatedAt",
      "description", "authorDisplayName", "fgEstimateMode", "fgEstimateDetails", "heroImageId", "rating",
      "completedBrewCount", "cloneCount"
    ]),
    versionCount: 1,
    versions: [],
    hiddenAt: null,
    hiddenReason: null,
    authorNotes: null,
    draftState: null,
    equipmentProfileId: null,
    brewPlanMeta: null,
    importMeta: attribution ? { sourceAttribution: attribution } : null,
    equipmentProfileSnapshot: equipment ? { ...equipment, id: null, name: "Оборудование рецепта", notes: null } : null,
    processMeta: recipeProcessMetaSchema.parse(recipe.processMeta),
    calculationMeta: recipe.calculationMeta ? recipeCalculationMetaSchema.parse(recipe.calculationMeta) : null,
    waterPlanMeta: water ? {
      ...water,
      sourceProfileMode: water.sourceProfileMode === "saved" ? "manual" : water.sourceProfileMode,
      sourceProfileSavedId: null,
      sourceProfileName: null,
      targetProfileMode: water.targetProfileMode === "saved" ? "manual" : water.targetProfileMode,
      targetProfileSavedId: null,
      targetProfileName: water.targetProfileMode === "saved" || water.targetProfileMode === "manual" ? null : water.targetProfileName,
      targetProfileSource: water.targetProfileSource === "user_saved" ? "manual" : water.targetProfileSource
    } : null,
    clonedFrom: recipe.clonedFrom?.isPublished ? recipe.clonedFrom : null,
    ingredients: recipe.ingredients.map(publicIngredient)
  };
};
