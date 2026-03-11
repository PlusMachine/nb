import { calculateAbv, calculateFg, calculateOg } from "./gravity";
import { calculateColor } from "./color";
import { calculateIbuTinseth } from "./ibu";
import { roundTo } from "../units";
import type { RecipeStats, ScalableRecipe } from "../types/recipe";

export interface ScaleBatchInput {
  recipe: ScalableRecipe;
  targetBatchVolumeL: number;
}

export const scaleRecipeBatch = ({ recipe, targetBatchVolumeL }: ScaleBatchInput): ScalableRecipe => {
  const factor = targetBatchVolumeL / recipe.batchVolumeL;

  return {
    batchVolumeL: roundTo(targetBatchVolumeL, 2),
    fermentables: recipe.fermentables.map((item) => ({
      ...item,
      weightKg: roundTo(item.weightKg * factor, 3)
    })),
    hops: recipe.hops.map((item) => ({
      ...item,
      weightG: roundTo(item.weightG * factor, 1)
    }))
  };
};

export interface RecalculateScaledStatsInput {
  recipe: ScalableRecipe;
  efficiencyPercent: number;
  attenuationPercent: number;
}

export const recalculateScaledStats = ({
  recipe,
  efficiencyPercent,
  attenuationPercent
}: RecalculateScaledStatsInput): RecipeStats => {
  const og = calculateOg({
    fermentables: recipe.fermentables,
    batchVolumeL: recipe.batchVolumeL,
    brewhouseEfficiencyPercent: efficiencyPercent
  });
  const fg = calculateFg({ og, attenuationPercent });
  const abv = calculateAbv(og, fg);
  const ibu = calculateIbuTinseth({ og, batchVolumeL: recipe.batchVolumeL, hopAdditions: recipe.hops });
  const { srm, ebc } = calculateColor(recipe.fermentables, recipe.batchVolumeL);

  return { og, fg, abv, ibu, srm, ebc };
};
