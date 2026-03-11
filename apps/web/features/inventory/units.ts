import { convertVolume, convertWeight, roundTo } from "@nb/brewing-core";

import type { IngredientType } from "../ingredients/contracts";

export const inventoryUnitDimensions = ["weight", "volume", "count"] as const;
export type InventoryUnitDimension = (typeof inventoryUnitDimensions)[number];

export const inventoryWeightUnits = ["g", "kg", "oz", "lb"] as const;
export const inventoryVolumeUnits = ["ml", "l", "gal"] as const;
export const inventoryCountUnits = ["item", "pack"] as const;
export const inventoryUnits = [...inventoryWeightUnits, ...inventoryVolumeUnits, ...inventoryCountUnits] as const;

export type InventoryWeightUnit = (typeof inventoryWeightUnits)[number];
export type InventoryVolumeUnit = (typeof inventoryVolumeUnits)[number];
export type InventoryCountUnit = (typeof inventoryCountUnits)[number];
export type InventoryUnit = (typeof inventoryUnits)[number];

export type NormalizedInventoryMeasurement = {
  enteredQuantity: number;
  enteredUnit: InventoryUnit;
  normalizedQuantity: number;
  normalizedUnit: InventoryUnit;
  unitDimension: InventoryUnitDimension;
};

export const inventoryUnitLabels: Record<InventoryUnit, string> = {
  g: "g",
  kg: "kg",
  oz: "oz",
  lb: "lb",
  ml: "ml",
  l: "l",
  gal: "gal",
  item: "item (шт.)",
  pack: "pack (пачка)"
};

const unitDimensionByUnit: Record<InventoryUnit, InventoryUnitDimension> = {
  g: "weight",
  kg: "weight",
  oz: "weight",
  lb: "weight",
  ml: "volume",
  l: "volume",
  gal: "volume",
  item: "count",
  pack: "count"
};

const unitsByDimension: Record<InventoryUnitDimension, readonly InventoryUnit[]> = {
  weight: inventoryWeightUnits,
  volume: inventoryVolumeUnits,
  count: inventoryCountUnits
};

const allowedDimensionsByIngredientType: Record<IngredientType, readonly InventoryUnitDimension[]> = {
  fermentable: ["weight"],
  hop: ["weight"],
  yeast: ["count", "weight", "volume"],
  sugar: ["weight"],
  adjunct: ["weight", "volume", "count"],
  fining: ["weight", "volume", "count"],
  misc: ["weight", "volume", "count"]
};

const defaultUnitByIngredientType: Record<IngredientType, InventoryUnit> = {
  fermentable: "g",
  hop: "g",
  yeast: "pack",
  sugar: "g",
  adjunct: "g",
  fining: "g",
  misc: "item"
};

const roundInventoryQuantity = (value: number) => roundTo(value, 3);

export const normalizeInventoryUnitInput = (value: string) => value.trim().toLowerCase();

export const isSupportedInventoryUnit = (value: string): value is InventoryUnit => (
  (inventoryUnits as readonly string[]).includes(value)
);

export const parseInventoryUnit = (value: string): InventoryUnit | null => {
  const normalizedValue = normalizeInventoryUnitInput(value);
  return isSupportedInventoryUnit(normalizedValue) ? normalizedValue : null;
};

export const getInventoryUnitDimension = (unit: InventoryUnit): InventoryUnitDimension => unitDimensionByUnit[unit];

export const isUnitAllowedForIngredientType = (unit: InventoryUnit, ingredientType: IngredientType) => (
  allowedDimensionsByIngredientType[ingredientType].includes(getInventoryUnitDimension(unit))
);

export const getInventoryUnitOptions = (ingredientType: IngredientType): InventoryUnit[] => (
  allowedDimensionsByIngredientType[ingredientType].flatMap((dimension) => [...unitsByDimension[dimension]])
);

export const getDefaultInventoryUnit = (ingredientType: IngredientType): InventoryUnit => (
  defaultUnitByIngredientType[ingredientType]
);

export const normalizeInventoryMeasurement = (
  ingredientType: IngredientType,
  enteredQuantity: number,
  enteredUnitInput: string
): NormalizedInventoryMeasurement => {
  const normalizedEnteredUnit = parseInventoryUnit(enteredUnitInput);
  if (!normalizedEnteredUnit) {
    throw new Error("INVALID_UNIT");
  }

  if (!isUnitAllowedForIngredientType(normalizedEnteredUnit, ingredientType)) {
    throw new Error("INCOMPATIBLE_UNIT");
  }

  const enteredUnit = normalizedEnteredUnit;
  const roundedEnteredQuantity = roundInventoryQuantity(enteredQuantity);
  const unitDimension = getInventoryUnitDimension(enteredUnit);

  if (unitDimension === "weight") {
    const weightUnit = enteredUnit as InventoryWeightUnit;
    return {
      enteredQuantity: roundedEnteredQuantity,
      enteredUnit,
      normalizedQuantity: convertWeight({ value: roundedEnteredQuantity, unit: weightUnit }, "g").value,
      normalizedUnit: "g",
      unitDimension
    };
  }

  if (unitDimension === "volume") {
    const volumeUnit = enteredUnit as InventoryVolumeUnit;
    return {
      enteredQuantity: roundedEnteredQuantity,
      enteredUnit,
      normalizedQuantity: convertVolume({ value: roundedEnteredQuantity, unit: volumeUnit }, "ml").value,
      normalizedUnit: "ml",
      unitDimension
    };
  }

  return {
    enteredQuantity: roundedEnteredQuantity,
    enteredUnit,
    normalizedQuantity: roundedEnteredQuantity,
    normalizedUnit: enteredUnit,
    unitDimension
  };
};
