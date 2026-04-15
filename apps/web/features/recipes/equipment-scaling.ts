import { roundTo } from "@nb/brewing-core";

export type EquipmentScalingIngredientInput = {
  category: string;
  amountEnteredQuantity: string;
};

export type EquipmentScalingInput<TIngredient extends EquipmentScalingIngredientInput> = {
  currentBatchVolumeL: number;
  targetBatchVolumeL: number;
  currentEfficiencyPct: number;
  targetEfficiencyPct: number;
  ingredients: TIngredient[];
};

export type EquipmentScalingResult<TIngredient extends EquipmentScalingIngredientInput> = {
  batchSizeQuantityL: string;
  efficiencyPct: string;
  volumeRatio: number;
  fermentableFactor: number;
  hopFactor: number;
  ingredients: TIngredient[];
  warnings: string[];
};

const formatScaledQuantity = (value: number) => {
  const rounded = roundTo(value, value >= 10 ? 1 : 3);
  return String(Number.isInteger(rounded) ? Math.trunc(rounded) : rounded);
};

export const scaleRecipeEditorToEquipment = <TIngredient extends EquipmentScalingIngredientInput>(
  input: EquipmentScalingInput<TIngredient>
): EquipmentScalingResult<TIngredient> => {
  const currentBatchVolumeL = Math.max(0, input.currentBatchVolumeL);
  const targetBatchVolumeL = Math.max(0, input.targetBatchVolumeL);
  const currentEfficiencyPct = Math.max(0.0001, input.currentEfficiencyPct);
  const targetEfficiencyPct = Math.max(0.0001, input.targetEfficiencyPct);

  if (currentBatchVolumeL <= 0 || targetBatchVolumeL <= 0) {
    return {
      batchSizeQuantityL: formatScaledQuantity(targetBatchVolumeL || currentBatchVolumeL),
      efficiencyPct: formatScaledQuantity(targetEfficiencyPct),
      volumeRatio: 1,
      fermentableFactor: 1,
      hopFactor: 1,
      ingredients: input.ingredients,
      warnings: ["invalid_batch_volume_for_equipment_scaling"]
    };
  }

  const volumeRatio = targetBatchVolumeL / currentBatchVolumeL;
  const fermentableFactor = volumeRatio * (currentEfficiencyPct / targetEfficiencyPct);
  const hopFactor = volumeRatio;

  return {
    batchSizeQuantityL: formatScaledQuantity(targetBatchVolumeL),
    efficiencyPct: formatScaledQuantity(targetEfficiencyPct),
    volumeRatio: roundTo(volumeRatio, 4),
    fermentableFactor: roundTo(fermentableFactor, 4),
    hopFactor: roundTo(hopFactor, 4),
    ingredients: input.ingredients.map((ingredient) => {
      const quantity = Number(ingredient.amountEnteredQuantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return ingredient;
      }

      const factor = ingredient.category === "fermentable"
        ? fermentableFactor
        : ingredient.category === "hop"
          ? hopFactor
          : 1;

      if (factor === 1) {
        return ingredient;
      }

      return {
        ...ingredient,
        amountEnteredQuantity: formatScaledQuantity(quantity * factor)
      };
    }),
    warnings: [
      "equipment_scaling_practical_approximation",
      "hops_scaled_by_g_per_l_for_v15"
    ]
  };
};
