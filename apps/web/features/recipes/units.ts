import { convertVolume, convertWeight, roundTo } from "@nb/brewing-core";

import type { IngredientType } from "../ingredients/contracts";
import {
  getInventoryUnitDimension,
  inventoryCountUnits,
  inventoryUnits,
  inventoryVolumeUnits,
  inventoryWeightUnits,
  isUnitAllowedForIngredientType,
  parseInventoryUnit,
  type InventoryCountUnit,
  type InventoryUnit,
  type InventoryUnitDimension,
  type InventoryVolumeUnit,
  type InventoryWeightUnit
} from "../inventory/units";

export type NormalizedRecipeBatchSize = {
  enteredQuantity: number;
  enteredUnit: InventoryVolumeUnit;
  normalizedQuantity: number;
  normalizedUnit: "ml";
};

export type NormalizedRecipeIngredientAmount = {
  enteredQuantity: number;
  enteredUnit: InventoryUnit;
  normalizedQuantity: number;
  normalizedUnit: InventoryUnit;
  unitDimension: InventoryUnitDimension;
};

const roundRecipeQuantity = (value: number) => roundTo(value, 3);

export const parseRecipeUnit = (value: string) => parseInventoryUnit(value);

export const normalizeRecipeBatchSize = (enteredQuantity: number, enteredUnitInput: string): NormalizedRecipeBatchSize => {
  const enteredUnit = parseRecipeUnit(enteredUnitInput);
  if (!enteredUnit || !(inventoryVolumeUnits as readonly string[]).includes(enteredUnit)) {
    throw new Error("INVALID_BATCH_SIZE_UNIT");
  }

  const volumeUnit = enteredUnit as InventoryVolumeUnit;
  const roundedEnteredQuantity = roundRecipeQuantity(enteredQuantity);

  return {
    enteredQuantity: roundedEnteredQuantity,
    enteredUnit: volumeUnit,
    normalizedQuantity: convertVolume({ value: roundedEnteredQuantity, unit: volumeUnit }, "ml").value,
    normalizedUnit: "ml"
  };
};

export const normalizeRecipeIngredientAmount = (
  ingredientType: IngredientType,
  enteredQuantity: number,
  enteredUnitInput: string
): NormalizedRecipeIngredientAmount => {
  const enteredUnit = parseRecipeUnit(enteredUnitInput);
  if (!enteredUnit || !(inventoryUnits as readonly string[]).includes(enteredUnit)) {
    throw new Error("INVALID_UNIT");
  }

  if (!isUnitAllowedForIngredientType(enteredUnit, ingredientType)) {
    throw new Error("INCOMPATIBLE_UNIT");
  }

  const roundedEnteredQuantity = roundRecipeQuantity(enteredQuantity);
  const unitDimension = getInventoryUnitDimension(enteredUnit);

  if ((inventoryWeightUnits as readonly string[]).includes(enteredUnit)) {
    const weightUnit = enteredUnit as InventoryWeightUnit;
    return {
      enteredQuantity: roundedEnteredQuantity,
      enteredUnit,
      normalizedQuantity: convertWeight({ value: roundedEnteredQuantity, unit: weightUnit }, "g").value,
      normalizedUnit: "g",
      unitDimension
    };
  }

  if ((inventoryVolumeUnits as readonly string[]).includes(enteredUnit)) {
    const volumeUnit = enteredUnit as InventoryVolumeUnit;
    return {
      enteredQuantity: roundedEnteredQuantity,
      enteredUnit,
      normalizedQuantity: convertVolume({ value: roundedEnteredQuantity, unit: volumeUnit }, "ml").value,
      normalizedUnit: "ml",
      unitDimension
    };
  }

  const countUnit = enteredUnit as InventoryCountUnit;
  if (!(inventoryCountUnits as readonly string[]).includes(countUnit)) {
    throw new Error("INVALID_UNIT");
  }

  return {
    enteredQuantity: roundedEnteredQuantity,
    enteredUnit,
    normalizedQuantity: roundedEnteredQuantity,
    normalizedUnit: enteredUnit,
    unitDimension
  };
};

export const toBatchVolumeLiters = (normalizedQuantity: number, normalizedUnit: string): number => {
  if (normalizedUnit !== "ml") {
    throw new Error("INVALID_BATCH_SIZE_NORMALIZED_UNIT");
  }

  return roundTo(normalizedQuantity / 1000, 3);
};
