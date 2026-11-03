import { convertVolume, roundTo } from "@nb/brewing-core";

import type {
  IngredientCategory,
  IngredientTechnicalData,
  IngredientType,
  IngredientSubtype
} from "../ingredients/contracts";
import {
  inventoryUnits,
  normalizeInventoryMeasurementForProfile,
  inventoryVolumeUnits,
  parseInventoryUnit,
  resolveInventoryUnitProfile,
  type InventoryUnitProfile,
  type InventoryUnit,
  type InventoryUnitDimension,
  type InventoryVolumeUnit
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
  const normalizedQuantity = convertVolume({ value: roundedEnteredQuantity, unit: volumeUnit }, "ml").value;
  if (!Number.isFinite(normalizedQuantity) || roundedEnteredQuantity <= 0 || normalizedQuantity <= 0) {
    throw new Error("INVALID_BATCH_SIZE_PRECISION");
  }
  return {
    enteredQuantity: roundedEnteredQuantity,
    enteredUnit: volumeUnit,
    normalizedQuantity,
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

  // Inventory normalization already validates dimensions and canonical precision.
  // Rounding the entered kg a second time would turn valid milligrams into zero.
  return normalizeInventoryMeasurementForProfile(profile, enteredQuantity, enteredUnit);
};

export const toBatchVolumeLiters = (normalizedQuantity: number, normalizedUnit: string): number => {
  if (normalizedUnit !== "ml") {
    throw new Error("INVALID_BATCH_SIZE_NORMALIZED_UNIT");
  }

  return roundTo(normalizedQuantity / 1000, 3);
};
