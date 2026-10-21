import { convertWeight } from "@nb/brewing-core";

import type { IngredientTechnicalData } from "../ingredients/contracts";
import { fermentableAppliesMashEfficiency } from "../ingredients/technical-fields";
import type { RecipeIngredientDto } from "./contracts";
import type { RecipeWaterPlanFermentableInput } from "./water-plan";

type WaterPlanIngredient = {
  name: string | null;
  category?: string | null;
  type: string;
  subtype?: string | null;
  stage: string;
  stepMeta?: Record<string, unknown> | null;
  quantity: number;
  unit: string;
  technicalData?: IngredientTechnicalData | null;
};

/** Только зерно в заторе/настое влияет на поглощение воды и модель pH затора. */
export const buildWaterPlanFermentables = (
  ingredients: WaterPlanIngredient[]
): RecipeWaterPlanFermentableInput[] => ingredients.flatMap((ingredient) => {
  const isFermentable = ingredient.category === "fermentable"
    || ingredient.type === "malt" || ingredient.type === "fermentable";
  const use = ingredient.stepMeta?.use;
  if (!isFermentable || ingredient.stage !== "mash"
    || (use != null && use !== "mash" && use !== "steep")
    || !fermentableAppliesMashEfficiency(
      ingredient.technicalData,
      ingredient.type === "malt" || ingredient.subtype === "malt"
    )) {
    return [];
  }
  if (!Number.isFinite(ingredient.quantity) || ingredient.quantity <= 0
    || !["g", "kg", "oz", "lb"].includes(ingredient.unit)) {
    return [];
  }
  const weightKg = convertWeight({
    value: ingredient.quantity,
    unit: ingredient.unit as "g" | "kg" | "oz" | "lb"
  }, "kg").value;
  const malt = ingredient.technicalData?.type === "malt"
    ? ingredient.technicalData as Extract<IngredientTechnicalData, { type: "malt" }>
    : null;
  return [{
    name: ingredient.name,
    subtype: ingredient.subtype ?? null,
    weightKg,
    maltType: malt?.maltType ?? null,
    colorEbcMin: malt?.colorEbcMin ?? null,
    colorEbcMax: malt?.colorEbcMax ?? null
  }];
});

/** Тот же состав для публичной страницы и сохранённого плана варки. */
export const buildRecipeWaterPlanFermentables = (ingredients: RecipeIngredientDto[]) => (
  buildWaterPlanFermentables(ingredients.map((ingredient) => ({
    name: ingredient.ingredientDisplayName ?? ingredient.ingredientDisplayNameRu
      ?? ingredient.ingredientDisplayNameSnapshot ?? null,
    category: ingredient.ingredientCategory,
    type: ingredient.type,
    subtype: ingredient.ingredientSubtype,
    stage: ingredient.stage,
    stepMeta: ingredient.stepMeta,
    quantity: ingredient.amountNormalizedQuantity,
    unit: ingredient.amountNormalizedUnit,
    technicalData: ingredient.ingredientTechnicalData
  })))
);
