import { convertVolume, convertWeight, roundTo } from "@nb/brewing-core";

import type {
  IngredientCategory,
  IngredientTechnicalData,
  IngredientType,
  IngredientSubtype
} from "../ingredients/contracts";
import {
  getInventoryUnitDimension,
  inventoryCountUnits,
  inventoryUnits,
  normalizeInventoryMeasurementForProfile,
  inventoryVolumeUnits,
  inventoryWeightUnits,
  parseInventoryUnit,
  resolveInventoryUnitProfile,
  type InventoryUnitProfile,
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
): NormalizedRecipeIngredientAmount => normalizeRecipeIngredientAmountWithProfile(
  resolveInventoryUnitProfile({ type: ingredientType }),
  enteredQuantity,
  enteredUnitInput
);

export const normalizeRecipeIngredientAmountWithSource = (
  input: {
    type?: IngredientType | null;
    category?: IngredientCategory | null;
    subtype?: IngredientSubtype | null;
    defaultDisplayUnit?: string | null;
    allowedUnits?: readonly string[] | null;
    measurementDimension?: string | null;
    technicalData?: IngredientTechnicalData | null;
  },
  enteredQuantity: number,
  enteredUnitInput: string
): NormalizedRecipeIngredientAmount => normalizeRecipeIngredientAmountWithProfile(
  resolveInventoryUnitProfile(input),
  enteredQuantity,
  enteredUnitInput
);

export const normalizeRecipeIngredientAmountWithProfile = (
  profile: InventoryUnitProfile,
  enteredQuantity: number,
  enteredUnitInput: string
): NormalizedRecipeIngredientAmount => {
  const enteredUnit = parseRecipeUnit(enteredUnitInput);
  if (!enteredUnit || !(inventoryUnits as readonly string[]).includes(enteredUnit)) {
    throw new Error("INVALID_UNIT");
  }

  const normalizedMeasurement = normalizeInventoryMeasurementForProfile(profile, enteredQuantity, enteredUnit);
  const roundedEnteredQuantity = roundRecipeQuantity(normalizedMeasurement.enteredQuantity);
  const unitDimension = getInventoryUnitDimension(normalizedMeasurement.enteredUnit);

  if ((inventoryWeightUnits as readonly string[]).includes(enteredUnit)) {
    const weightUnit = normalizedMeasurement.enteredUnit as InventoryWeightUnit;
    return {
      enteredQuantity: roundedEnteredQuantity,
      enteredUnit: normalizedMeasurement.enteredUnit,
      normalizedQuantity: convertWeight({ value: roundedEnteredQuantity, unit: weightUnit }, "g").value,
      normalizedUnit: "g",
      unitDimension
    };
  }

  if ((inventoryVolumeUnits as readonly string[]).includes(enteredUnit)) {
    const volumeUnit = normalizedMeasurement.enteredUnit as InventoryVolumeUnit;
    return {
      enteredQuantity: roundedEnteredQuantity,
      enteredUnit: normalizedMeasurement.enteredUnit,
      normalizedQuantity: convertVolume({ value: roundedEnteredQuantity, unit: volumeUnit }, "ml").value,
      normalizedUnit: "ml",
      unitDimension
    };
  }

  const countUnit = normalizedMeasurement.enteredUnit as InventoryCountUnit;
  if (!(inventoryCountUnits as readonly string[]).includes(countUnit)) {
    throw new Error("INVALID_UNIT");
  }

  return {
    enteredQuantity: roundedEnteredQuantity,
    enteredUnit: normalizedMeasurement.enteredUnit,
    normalizedQuantity: roundedEnteredQuantity,
    normalizedUnit: normalizedMeasurement.enteredUnit,
    unitDimension
  };
};

export const toBatchVolumeLiters = (normalizedQuantity: number, normalizedUnit: string): number => {
  if (normalizedUnit !== "ml") {
    throw new Error("INVALID_BATCH_SIZE_NORMALIZED_UNIT");
  }

  return roundTo(normalizedQuantity / 1000, 3);
};
