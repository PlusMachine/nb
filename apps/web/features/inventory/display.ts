import { convertVolume, convertWeight, roundTo } from "@nb/brewing-core";

import type { IngredientCategory, IngredientTechnicalData, IngredientType, IngredientSubtype } from "../ingredients/contracts";
import { resolvePreferredCurrency, convertCurrencyMinor, convertRubMinorToCurrencyMinor, formatCurrencyMinor, formatUnitPriceMinor } from "../system/money";
import type { SystemCurrency, SystemCurrencyRateMap } from "../system/currency";
import {
  getInventoryUnitDimension,
  inventoryUnitShortLabels,
  normalizeInventoryMeasurementForProfile,
  resolveInventoryUnitProfile,
  type InventoryUnit
} from "./units";

type InventoryDisplayInput = {
  enteredQuantity: number;
  enteredUnit: InventoryUnit;
  normalizedQuantity: number;
  normalizedUnit: InventoryUnit;
  type?: IngredientType | null;
  category?: IngredientCategory | null;
  subtype?: IngredientSubtype | null;
  defaultDisplayUnit?: string | null;
  allowedUnits?: readonly string[] | null;
  measurementDimension?: string | null;
  technicalData?: IngredientTechnicalData | null;
};

type InventoryCostDisplayInput = InventoryDisplayInput & {
  purchasePriceMinor?: number | null;
  purchaseCurrency?: SystemCurrency | null;
  purchaseQuantityNormalizedUnit?: InventoryUnit | null;
  normalizedUnitCostMinorRub?: number | null;
};

const formatDisplayNumber = (value: number) => {
  const rounded = roundTo(value, 3);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
};

const resolvePackNormalizedQuantity = (technicalData?: IngredientTechnicalData | null) => {
  if (technicalData?.category !== "yeast" || technicalData.packageSize == null || technicalData.packageUnit == null) {
    return null;
  }

  if (technicalData.packageUnit === "pack") {
    return {
      normalizedQuantity: technicalData.packageSize,
      normalizedUnit: "pack" as const
    };
  }

  const measurement = normalizeInventoryMeasurementForProfile({
    defaultUnit: technicalData.packageUnit,
    allowedUnits: [technicalData.packageUnit],
    measurementDimension: getInventoryUnitDimension(technicalData.packageUnit)
  }, technicalData.packageSize, technicalData.packageUnit);

  return {
    normalizedQuantity: measurement.normalizedQuantity,
    normalizedUnit: measurement.normalizedUnit
  };
};

const convertNormalizedQuantityToDisplayUnit = (
  normalizedQuantity: number,
  normalizedUnit: InventoryUnit,
  displayUnit: InventoryUnit,
  technicalData?: IngredientTechnicalData | null
) => {
  if (normalizedUnit === displayUnit) {
    return normalizedQuantity;
  }

  if (normalizedUnit === "g" && ["g", "kg", "oz", "lb"].includes(displayUnit)) {
    return convertWeight({ value: normalizedQuantity, unit: "g" }, displayUnit as "g" | "kg" | "oz" | "lb").value;
  }

  if (normalizedUnit === "ml" && ["ml", "l", "gal"].includes(displayUnit)) {
    return convertVolume({ value: normalizedQuantity, unit: "ml" }, displayUnit as "ml" | "l" | "gal").value;
  }

  if (displayUnit === "pack") {
    const packQuantity = resolvePackNormalizedQuantity(technicalData);
    if (packQuantity && packQuantity.normalizedUnit === normalizedUnit && packQuantity.normalizedQuantity > 0) {
      return normalizedQuantity / packQuantity.normalizedQuantity;
    }
  }

  return null;
};

const resolveHumanDisplayUnit = (input: Omit<InventoryDisplayInput, "enteredQuantity" | "enteredUnit" | "normalizedQuantity" | "normalizedUnit">) => (
  resolveInventoryUnitProfile({
    type: input.type,
    category: input.category,
    subtype: input.subtype,
    defaultDisplayUnit: input.defaultDisplayUnit,
    allowedUnits: input.allowedUnits,
    measurementDimension: input.measurementDimension,
    technicalData: input.technicalData ?? null
  }).defaultUnit
);

const resolveDisplayUnitCostMinor = (
  normalizedUnitCostMinorRub: number,
  normalizedUnit: InventoryUnit,
  displayUnit: InventoryUnit,
  technicalData?: IngredientTechnicalData | null
) => {
  if (normalizedUnit === displayUnit) {
    return normalizedUnitCostMinorRub;
  }

  let normalizedUnitsPerDisplayUnit: number | null = null;

  if (normalizedUnit === "g" && ["g", "kg", "oz", "lb"].includes(displayUnit)) {
    normalizedUnitsPerDisplayUnit = convertWeight({ value: 1, unit: displayUnit as "g" | "kg" | "oz" | "lb" }, "g").value;
  } else if (normalizedUnit === "ml" && ["ml", "l", "gal"].includes(displayUnit)) {
    normalizedUnitsPerDisplayUnit = convertVolume({ value: 1, unit: displayUnit as "ml" | "l" | "gal" }, "ml").value;
  } else if (displayUnit === "pack") {
    const packQuantity = resolvePackNormalizedQuantity(technicalData);
    if (packQuantity && packQuantity.normalizedUnit === normalizedUnit) {
      normalizedUnitsPerDisplayUnit = packQuantity.normalizedQuantity;
    }
  }

  if (normalizedUnitsPerDisplayUnit == null || normalizedUnitsPerDisplayUnit <= 0) {
    return null;
  }

  return Math.round(normalizedUnitCostMinorRub * normalizedUnitsPerDisplayUnit);
};

export const formatInventoryQuantityForDisplay = (input: InventoryDisplayInput) => {
  const displayUnit = resolveHumanDisplayUnit(input);
  const displayQuantity = convertNormalizedQuantityToDisplayUnit(
    input.normalizedQuantity,
    input.normalizedUnit,
    displayUnit,
    input.technicalData ?? null
  );

  if (displayQuantity == null) {
    return `${formatDisplayNumber(input.enteredQuantity)} ${inventoryUnitShortLabels[input.enteredUnit]}`;
  }

  return `${formatDisplayNumber(displayQuantity)} ${inventoryUnitShortLabels[displayUnit]}`;
};

export const buildInventoryCostDisplay = (
  input: InventoryCostDisplayInput,
  preferredCurrencyInput: unknown,
  rates: SystemCurrencyRateMap
) => {
  const preferredCurrency = resolvePreferredCurrency(preferredCurrencyInput);
  const totalPrice = input.purchasePriceMinor != null && input.purchaseCurrency
    ? formatCurrencyMinor(
      convertCurrencyMinor(input.purchasePriceMinor, input.purchaseCurrency, preferredCurrency, rates),
      preferredCurrency
    )
    : null;
  const displayUnit = resolveHumanDisplayUnit(input);
  const normalizedCostUnit = input.purchaseQuantityNormalizedUnit ?? input.normalizedUnit;
  const displayUnitCostMinorRub = input.normalizedUnitCostMinorRub != null
    ? resolveDisplayUnitCostMinor(
      input.normalizedUnitCostMinorRub,
      normalizedCostUnit,
      displayUnit,
      input.technicalData ?? null
    )
    : null;
  const unitPrice = displayUnitCostMinorRub != null
    ? formatUnitPriceMinor(
      convertRubMinorToCurrencyMinor(displayUnitCostMinorRub, preferredCurrency, rates),
      preferredCurrency,
      inventoryUnitShortLabels[displayUnit]
    )
    : null;

  return {
    totalPrice,
    unitPrice,
    preferredCurrency
  };
};
