import type { IngredientCategory, IngredientType } from "@/features/ingredients/contracts";
import { extractIngredientTechnicalFields, lovibondToEbc } from "@/features/ingredients/technical-fields";
import type { CustomHopForm, CustomPhysicalForm, CustomYeastForm } from "@/features/inventory/custom-ingredient";
import type { InventoryUnit } from "@/features/inventory/units";
import type { RecipeDetailDto } from "../contracts";

export type CanonicalRecipeIngredient = {
  name: string;
  type: IngredientType;
  category: IngredientCategory;
  amount: number;
  unit: InventoryUnit;
  stage: RecipeDetailDto["ingredients"][number]["stage"];
  timeOffset?: number | null;
  stepMeta?: Record<string, unknown> | null;
  fermentableColorEbc?: number | null;
  fermentableExtractYieldPct?: number | null;
  hopAlphaAcidPct?: number | null;
  hopForm?: CustomHopForm | null;
  yeastAttenuationPct?: number | null;
  yeastForm?: CustomYeastForm | null;
  physicalForm?: CustomPhysicalForm | null;
  concentration?: string | null;
  externalImportMeta?: Record<string, unknown> | null;
};

export type CanonicalRecipe = {
  title: string;
  styleId?: string | null;
  batchSizeL?: number | null;
  boilTimeMinutes?: number | null;
  efficiency?: number | null;
  description?: string | null;
  authorNotes?: string | null;
  processMeta?: Record<string, unknown> | null;
  calculationMeta?: Record<string, unknown> | null;
  waterPlanMeta?: Record<string, unknown> | null;
  importMeta?: Record<string, unknown> | null;
  ingredients: CanonicalRecipeIngredient[];
};

const customHopForms = new Set<CustomHopForm>(["pellet", "whole_cone", "lupulin", "cryo", "standard"]);
const customYeastForms = new Set<CustomYeastForm>(["dry", "liquid", "slurry", "culture"]);

const asCustomHopForm = (value?: string | null): CustomHopForm | null => (
  value && customHopForms.has(value as CustomHopForm) ? value as CustomHopForm : null
);

const asCustomYeastForm = (value?: string | null): CustomYeastForm | null => (
  value && customYeastForms.has(value as CustomYeastForm) ? value as CustomYeastForm : null
);

const mapRecipeIngredientToCanonical = (
  ingredient: RecipeDetailDto["ingredients"][number]
): CanonicalRecipeIngredient => {
  const technicalFields = extractIngredientTechnicalFields({
    type: ingredient.type,
    technicalData: ingredient.ingredientTechnicalData ?? undefined
  });

  return {
    name: ingredient.ingredientDisplayName ?? ingredient.ingredientDisplayNameSnapshot ?? "Ingredient",
    type: ingredient.type,
    category: ingredient.ingredientCategory ?? "consumable",
    amount: ingredient.amountEnteredQuantity,
    unit: ingredient.amountEnteredUnit,
    stage: ingredient.stage,
    timeOffset: ingredient.timeOffset,
    stepMeta: ingredient.stepMeta,
    fermentableColorEbc: lovibondToEbc(technicalFields.fermentableColorLovibond),
    fermentableExtractYieldPct: technicalFields.fermentableExtractYieldPct ?? null,
    hopAlphaAcidPct: technicalFields.hopAlphaAcidPct ?? null,
    hopForm: asCustomHopForm(technicalFields.hopForm),
    yeastAttenuationPct: technicalFields.yeastAttenuationPct ?? null,
    yeastForm: asCustomYeastForm(technicalFields.yeastForm),
    externalImportMeta: ingredient.externalImportMeta ?? null
  };
};

export const mapRecipeToCanonical = (recipe: RecipeDetailDto): CanonicalRecipe => ({
  title: recipe.title,
  styleId: recipe.styleId,
  batchSizeL: recipe.batchSizeNormalizedUnit === "ml" ? recipe.batchSizeNormalizedQuantity / 1000 : null,
  boilTimeMinutes: recipe.boilTimeMinutes,
  efficiency: recipe.efficiency,
  description: recipe.description,
  authorNotes: recipe.authorNotes,
  processMeta: recipe.processMeta as unknown as Record<string, unknown>,
  calculationMeta: recipe.calculationMeta as unknown as Record<string, unknown> | null,
  waterPlanMeta: recipe.waterPlanMeta as unknown as Record<string, unknown> | null,
  ingredients: recipe.ingredients.map(mapRecipeIngredientToCanonical)
});

export const canonicalToRecipeCreatePayload = (canonical: CanonicalRecipe) => ({
  title: canonical.title,
  publicationState: "private" as const,
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
    type: ingredient.type,
    category: ingredient.category,
    amountEnteredQuantity: ingredient.amount,
    amountEnteredUnit: ingredient.unit,
    stage: ingredient.stage,
    timeOffset: ingredient.timeOffset ?? null,
    stepMeta: ingredient.stepMeta ?? null,
    externalImportMeta: ingredient.externalImportMeta ?? null
  }))
});
