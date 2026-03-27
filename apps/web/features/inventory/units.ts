import { convertVolume, convertWeight, roundTo } from "@nb/brewing-core";

import type { IngredientTechnicalData, IngredientType } from "../ingredients/contracts";
import type {
  IngredientCategory,
  IngredientDisplayUnit,
  IngredientMeasurementDimension,
  IngredientSubtype
} from "../ingredients/taxonomy";
import {
  isIngredientDisplayUnit,
  resolveIngredientCategory,
  resolveIngredientUnits
} from "../ingredients/taxonomy";

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

export type InventoryUnitProfile = {
  defaultUnit: InventoryUnit;
  allowedUnits: InventoryUnit[];
  measurementDimension: InventoryUnitDimension;
};

type InventoryUnitProfileInput = {
  type?: IngredientType | null;
  category?: IngredientCategory | null;
  subtype?: IngredientSubtype | null;
  defaultDisplayUnit?: string | null;
  allowedUnits?: readonly string[] | null;
  measurementDimension?: string | null;
  technicalData?: IngredientTechnicalData | null;
  quantityDefaults?: Record<string, unknown> | null;
  unitPreferred?: string | null;
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

export const inventoryUnitShortLabels: Record<InventoryUnit, string> = {
  g: "g",
  kg: "kg",
  oz: "oz",
  lb: "lb",
  ml: "ml",
  l: "l",
  gal: "gal",
  item: "item",
  pack: "pack"
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

const normalizeUnitList = (units?: readonly string[] | null): InventoryUnit[] => {
  const normalized = (units ?? [])
    .map((unit) => parseInventoryUnit(unit))
    .filter((unit): unit is InventoryUnit => unit !== null);

  return [...new Set(normalized)];
};

const normalizeMeasurementDimension = (value?: string | null): InventoryUnitDimension | null => (
  value === "weight" || value === "volume" || value === "count" ? value : null
);

const normalizeInventoryAllowedUnits = (units: readonly InventoryUnit[]) => [...new Set(units)];

const resolveQuantityDefaultsProfile = (
  quantityDefaults?: Record<string, unknown> | null
): InventoryUnitProfile | null => {
  if (!quantityDefaults) {
    return null;
  }

  const stockUnit = parseInventoryUnit(String(
    quantityDefaults.stock_unit_default
    ?? quantityDefaults.recipe_unit_default
    ?? ""
  ));

  if (!stockUnit || stockUnit === "pack") {
    return null;
  }

  const measurementDimension = getInventoryUnitDimension(stockUnit);
  const stockModeDefault = String(quantityDefaults.stock_mode_default ?? "").trim().toLowerCase();
  const supportedModes = Array.isArray(quantityDefaults.stock_modes_supported)
    ? quantityDefaults.stock_modes_supported.map((value) => String(value).trim().toLowerCase())
    : [];
  const supportsPackages = stockModeDefault === "by_package_content"
    || stockModeDefault === "package"
    || supportedModes.includes("package")
    || supportedModes.includes("by_package_content");

  return {
    defaultUnit: stockUnit,
    allowedUnits: normalizeInventoryAllowedUnits([
      ...(supportsPackages ? (["pack"] as const) : []),
      ...unitsByDimension[measurementDimension]
    ]),
    measurementDimension
  };
};

const resolvePracticalYeastProfile = (
  resolvedCategory: IngredientCategory | null,
  explicitDefaultUnit: InventoryUnit | null,
  technicalData?: IngredientTechnicalData | null
): InventoryUnitProfile | null => {
  if (resolvedCategory !== "yeast" || technicalData?.type !== "yeast") {
    return null;
  }

  const isLiquid = technicalData.form === "liquid";

  if (technicalData.form === "dry") {
    return {
      defaultUnit: "pack",
      allowedUnits: normalizeInventoryAllowedUnits(["pack", "g"]),
      measurementDimension: "count"
    };
  }

  if (explicitDefaultUnit === "pack") {
    return {
      defaultUnit: "pack",
      allowedUnits: normalizeInventoryAllowedUnits(isLiquid ? ["pack", "ml"] : ["pack", "g"]),
      measurementDimension: "count"
    };
  }

  if (explicitDefaultUnit) {
    return null;
  }

  const defaultUnit = isLiquid ? "ml" : "g";
  const measurementDimension = getInventoryUnitDimension(defaultUnit);

  return {
    defaultUnit,
    allowedUnits: [...unitsByDimension[measurementDimension]],
    measurementDimension
  };
};

const toInventoryUnit = (unit: IngredientDisplayUnit): InventoryUnit => unit;

const toInventoryMeasurementDimension = (
  dimension: IngredientMeasurementDimension
): InventoryUnitDimension => dimension;

export const resolveInventoryUnitProfile = ({
  type,
  category,
  subtype,
  defaultDisplayUnit,
  allowedUnits,
  measurementDimension,
  technicalData,
  quantityDefaults,
  unitPreferred
}: InventoryUnitProfileInput): InventoryUnitProfile => {
  const explicitDefaultUnit = parseInventoryUnit(defaultDisplayUnit ?? "");
  const explicitAllowedUnits = normalizeUnitList(allowedUnits);
  const explicitMeasurementDimension = normalizeMeasurementDimension(measurementDimension);
  const quantityDefaultsProfile = resolveQuantityDefaultsProfile(quantityDefaults);
  const resolvedCategory = category ?? (type ? resolveIngredientCategory({ type }) : null);
  const practicalYeastProfile = resolvePracticalYeastProfile(resolvedCategory, explicitDefaultUnit, technicalData);

  if (quantityDefaultsProfile) {
    return quantityDefaultsProfile;
  }

  if (practicalYeastProfile) {
    return practicalYeastProfile;
  }

  if (explicitDefaultUnit && explicitAllowedUnits.length && explicitAllowedUnits.includes(explicitDefaultUnit)) {
    return {
      defaultUnit: explicitDefaultUnit,
      allowedUnits: explicitAllowedUnits,
      measurementDimension: explicitMeasurementDimension ?? getInventoryUnitDimension(explicitDefaultUnit)
    };
  }

  if (category || type) {
    const resolvedUnits = resolveIngredientUnits({
      category: category ?? undefined,
      type: type ?? undefined,
      subtype: subtype ?? undefined,
      defaultDisplayUnit: defaultDisplayUnit && isIngredientDisplayUnit(defaultDisplayUnit) ? defaultDisplayUnit : undefined,
      yeastForm: technicalData?.type === "yeast" && typeof technicalData.form === "string" ? technicalData.form : undefined,
      unitPreferred: unitPreferred
    });

    return {
      defaultUnit: toInventoryUnit(resolvedUnits.defaultDisplayUnit),
      allowedUnits: resolvedUnits.allowedUnits.map(toInventoryUnit),
      measurementDimension: toInventoryMeasurementDimension(resolvedUnits.measurementDimension)
    };
  }

  if (explicitDefaultUnit) {
    return {
      defaultUnit: explicitDefaultUnit,
      allowedUnits: [...unitsByDimension[getInventoryUnitDimension(explicitDefaultUnit)]],
      measurementDimension: explicitMeasurementDimension ?? getInventoryUnitDimension(explicitDefaultUnit)
    };
  }

  return {
    defaultUnit: "g",
    allowedUnits: [...unitsByDimension.weight],
    measurementDimension: "weight"
  };
};

export const resolveHumanFacingInventoryUnitProfile = (
  input: InventoryUnitProfileInput
): InventoryUnitProfile => {
  const profile = resolveInventoryUnitProfile(input);
  const resolvedCategory = input.category ?? (input.type ? resolveIngredientCategory({ type: input.type }) : null);

  if (resolvedCategory === "fermentable" && profile.allowedUnits.includes("kg")) {
    return {
      ...profile,
      defaultUnit: "kg"
    };
  }

  if (resolvedCategory === "hop" && profile.allowedUnits.includes("g")) {
    return {
      ...profile,
      defaultUnit: "g"
    };
  }

  if (resolvedCategory === "water_treatment") {
    if (input.subtype === "acid" && profile.allowedUnits.includes("ml")) {
      return {
        ...profile,
        defaultUnit: "ml"
      };
    }

    if (profile.allowedUnits.includes("g")) {
      return {
        ...profile,
        defaultUnit: "g"
      };
    }
  }

  if (resolvedCategory === "consumable" && profile.allowedUnits.includes(profile.defaultUnit)) {
    return profile;
  }

  if (resolvedCategory === "yeast" && profile.allowedUnits.includes("pack")) {
    return {
      ...profile,
      defaultUnit: "pack"
    };
  }

  return profile;
};

export const isUnitAllowedForInventoryProfile = (unit: InventoryUnit, profile: InventoryUnitProfile) => (
  profile.allowedUnits.includes(unit)
);

export const isUnitAllowedForIngredientType = (unit: InventoryUnit, ingredientType: IngredientType) => (
  isUnitAllowedForInventoryProfile(unit, resolveInventoryUnitProfile({ type: ingredientType }))
);

export const getInventoryUnitOptions = (ingredientType: IngredientType): InventoryUnit[] => (
  resolveInventoryUnitProfile({ type: ingredientType }).allowedUnits
);

export const getDefaultInventoryUnit = (ingredientType: IngredientType): InventoryUnit => (
  resolveInventoryUnitProfile({ type: ingredientType }).defaultUnit
);

export const normalizeInventoryMeasurementForProfile = (
  profile: InventoryUnitProfile,
  enteredQuantity: number,
  enteredUnitInput: string
): NormalizedInventoryMeasurement => {
  const normalizedEnteredUnit = parseInventoryUnit(enteredUnitInput);
  if (!normalizedEnteredUnit) {
    throw new Error("INVALID_UNIT");
  }

  if (!isUnitAllowedForInventoryProfile(normalizedEnteredUnit, profile)) {
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

export const normalizeInventoryMeasurement = (
  ingredientType: IngredientType,
  enteredQuantity: number,
  enteredUnitInput: string
): NormalizedInventoryMeasurement => normalizeInventoryMeasurementForProfile(
  resolveInventoryUnitProfile({ type: ingredientType }),
  enteredQuantity,
  enteredUnitInput
);
