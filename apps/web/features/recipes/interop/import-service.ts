import type { CanonicalRecipe } from "./canonical";
import { createRecipe } from "../service";
import type { RecipeImportedIngredientSnapshot } from "../contracts";
import { resolveIngredientSubtype } from "../../ingredients/taxonomy";
import { buildCustomIngredientTechnicalData } from "../../inventory/custom-ingredient";
import { resolveHumanFacingInventoryUnitProfile } from "../../inventory/units";

const defaultUnitForCategory = (category: CanonicalRecipe["ingredients"][number]["category"]) => {
  if (category === "fermentable") return "kg";
  if (category === "hop") return "g";
  if (category === "yeast") return "pack";
  if (category === "water_treatment") return "g";
  return "item";
};

type ImportedIngredient = CanonicalRecipe["ingredients"][number];

const buildImportedIngredientTechnicalData = (ingredient: ImportedIngredient) => buildCustomIngredientTechnicalData({
  type: ingredient.type,
  fermentableColorEbc: ingredient.fermentableColorEbc ?? null,
  fermentableExtractYieldPct: ingredient.fermentableExtractYieldPct ?? null,
  hopAlphaAcidPct: ingredient.hopAlphaAcidPct ?? null,
  hopForm: ingredient.hopForm ?? null,
  yeastAttenuationPct: ingredient.yeastAttenuationPct ?? null,
  yeastForm: ingredient.yeastForm ?? null,
  physicalForm: ingredient.physicalForm ?? null,
  concentration: ingredient.concentration ?? null,
  unitPreferred: ingredient.unit ?? null
});

const buildImportedIngredientSnapshot = (ingredient: ImportedIngredient): RecipeImportedIngredientSnapshot => {
  const subtype = resolveIngredientSubtype({
    type: ingredient.type,
    category: ingredient.category
  }) ?? null;
  const technicalData = buildImportedIngredientTechnicalData(ingredient);
  const unitProfile = resolveHumanFacingInventoryUnitProfile({
    type: ingredient.type,
    category: ingredient.category,
    subtype,
    defaultDisplayUnit: ingredient.unit ?? defaultUnitForCategory(ingredient.category),
    technicalData
  });
  const rawSource = ingredient.externalImportMeta?.source;

  return {
    version: 1,
    source: typeof rawSource === "string" ? rawSource : null,
    name: ingredient.name.trim() || "Imported ingredient",
    type: ingredient.type,
    category: ingredient.category,
    subtype,
    defaultDisplayUnit: ingredient.unit ?? unitProfile.defaultUnit,
    allowedUnits: unitProfile.allowedUnits,
    measurementDimension: unitProfile.measurementDimension,
    technicalData
  };
};

const buildImportedExternalImportMeta = (ingredient: ImportedIngredient) => ({
  ...(ingredient.externalImportMeta ?? {}),
  importedIngredient: buildImportedIngredientSnapshot(ingredient)
});

export const createRecipeFromCanonicalImport = async (userId: string, canonical: CanonicalRecipe) => {
  if (!canonical.title.trim()) {
    throw new Error("INVALID_IMPORT_RECIPE");
  }

  if (!canonical.ingredients.length) {
    throw new Error("IMPORT_RECIPE_EMPTY");
  }

  for (const ingredient of canonical.ingredients) {
    if (!Number.isFinite(ingredient.amount) || ingredient.amount <= 0) {
      throw new Error("INVALID_IMPORT_INGREDIENT_AMOUNT");
    }
  }

  return createRecipe(userId, {
    title: canonical.title,
    publicationState: "private",
    styleId: canonical.styleId ?? null,
    batchSizeEnteredQuantity: canonical.batchSizeL ?? 20,
    batchSizeEnteredUnit: "l",
    efficiency: canonical.efficiency ?? null,
    boilTimeMinutes: canonical.boilTimeMinutes ?? 60,
    description: canonical.description ?? null,
    authorNotes: canonical.authorNotes ?? null,
    processMeta: canonical.processMeta ?? null,
    calculationMeta: canonical.calculationMeta ?? null,
    waterPlanMeta: canonical.waterPlanMeta ?? null,
    importMeta: canonical.importMeta ?? null,
    ingredients: canonical.ingredients.map((ingredient) => ({
      ingredientCatalogItemId: null,
      userCustomIngredientId: null,
      type: ingredient.type,
      category: ingredient.category,
      subtype: resolveIngredientSubtype({ type: ingredient.type, category: ingredient.category }) ?? null,
      amountEnteredQuantity: ingredient.amount,
      amountEnteredUnit: ingredient.unit,
      stage: ingredient.stage,
      timeOffset: ingredient.timeOffset ?? null,
      stepMeta: ingredient.stepMeta ?? null,
      inventoryIntentMode: "imported",
      externalImportMeta: buildImportedExternalImportMeta(ingredient)
    }))
  });
};
