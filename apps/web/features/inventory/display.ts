import { convertVolume, convertWeight, roundTo } from "@nb/brewing-core";

import type { IngredientCategory, IngredientTechnicalData, IngredientType, IngredientSubtype } from "../ingredients/contracts";
import { resolvePreferredCurrency, convertCurrencyMinor, convertRubMinorToCurrencyMinor, formatCurrencyMinor, formatUnitPriceMinor } from "../system/money";
import type { SystemCurrency, SystemCurrencyRateMap } from "../system/currency";
import {
  formatInventoryUnitLabel,
  getInventoryUnitQuantityPrecision,
  inventoryUnitShortLabels,
  resolveHumanFacingInventoryUnitProfile,
  type InventoryUnit
} from "./units";
import { resolveInventoryPackEquivalent, type InventoryPackEquivalent } from "./pack";

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

const formatDisplayNumber = (value: number, precision = 3) => {
  const rounded = roundTo(value, precision);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(precision).replace(/0+$/, "").replace(/\.$/, "");
};

const resolvePackNormalizedQuantity = (technicalData?: IngredientTechnicalData | null) => (
  resolveInventoryPackEquivalent(technicalData)
);

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

export const resolveInventoryHumanDisplayUnit = (
  input: Omit<InventoryDisplayInput, "enteredQuantity" | "enteredUnit" | "normalizedQuantity" | "normalizedUnit">
) => (
  resolveHumanFacingInventoryUnitProfile({
    type: input.type,
    category: input.category,
    subtype: input.subtype,
    defaultDisplayUnit: input.defaultDisplayUnit,
    allowedUnits: input.allowedUnits,
    measurementDimension: input.measurementDimension,
    technicalData: input.technicalData ?? null
  }).defaultUnit
);

export const resolveInventoryMeasurementForDisplay = (input: InventoryDisplayInput) => {
  const displayUnit = resolveInventoryHumanDisplayUnit(input);
  const displayQuantity = convertNormalizedQuantityToDisplayUnit(
    input.normalizedQuantity,
    input.normalizedUnit,
    displayUnit,
    input.technicalData ?? null
  );

  if (displayQuantity == null) {
    return {
      quantity: roundTo(input.enteredQuantity, 3),
      unit: input.enteredUnit,
      converted: false
    };
  }

  return {
    quantity: roundTo(displayQuantity, 3),
    unit: displayUnit,
    converted: displayUnit !== input.enteredUnit
      || roundTo(displayQuantity, 3) !== roundTo(input.enteredQuantity, 3)
  };
};

export const formatInventoryQuantityInputValue = (value: number, unit?: InventoryUnit) => (
  formatDisplayNumber(value, unit ? getInventoryUnitQuantityPrecision(unit) : 3)
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
  const displayMeasurement = resolveInventoryMeasurementForDisplay(input);
  const base = `${formatInventoryQuantityInputValue(displayMeasurement.quantity, displayMeasurement.unit)} ${formatInventoryUnitLabel(displayMeasurement.unit, displayMeasurement.quantity)}`;

  if (displayMeasurement.unit !== "pack") {
    return base;
  }

  const packQuantity = resolvePackNormalizedQuantity(input.technicalData ?? null);
  if (!packQuantity || input.normalizedUnit !== packQuantity.normalizedUnit) {
    return base;
  }

  return `${base} (${formatInventoryQuantityInputValue(input.normalizedQuantity, input.normalizedUnit)} ${formatInventoryUnitLabel(input.normalizedUnit, input.normalizedQuantity)})`;
};

// Эпсилон-защита ceil от плавающего шума — тот же паттерн, что и в
// features/recipes/scale.ts (Ф9): «почти целая» пачка не должна округляться вверх.
const PACK_HINT_CEIL_EPSILON = 1e-9;

/**
 * Ф9 «граммы как факт»: обратное направление к строке склада «1 пачка (11 г)»
 * (см. formatInventoryQuantityForDisplay выше — она НЕ меняется, там пачка —
 * физический факт). Здесь факт — уже посчитанный вес/объём (после пересчёта
 * рецепта под объём, features/recipes/scale.ts), а число пачек в скобках —
 * ориентир "сколько взять": N = ceil(количество / граммовка пачки). Пусто, если
 * packEquivalent не резолвится или его единица не совпадает с unit количества.
 */
export const formatPackCountHintSuffix = (
  quantity: number,
  unit: InventoryUnit,
  packEquivalent?: InventoryPackEquivalent | null
): string | null => {
  if (!packEquivalent || packEquivalent.normalizedUnit !== unit || !(packEquivalent.normalizedQuantity > 0)) {
    return null;
  }
  const packs = Math.max(1, Math.ceil(quantity / packEquivalent.normalizedQuantity - PACK_HINT_CEIL_EPSILON));
  return `${packs} ${formatInventoryUnitLabel("pack", packs)}`;
};

/** «X г (N пачек)» целиком — formatPackCountHintSuffix + голое количество, когда подсказки нет. */
export const formatQuantityWithPackCountHint = (
  quantity: number,
  unit: InventoryUnit,
  packEquivalent?: InventoryPackEquivalent | null
): string => {
  const base = `${formatInventoryQuantityInputValue(quantity, unit)} ${formatInventoryUnitLabel(unit, quantity)}`;
  const hint = formatPackCountHintSuffix(quantity, unit, packEquivalent);
  return hint ? `${base} (${hint})` : base;
};

/** Тонкая обёртка над formatQuantityWithPackCountHint для мест, где под рукой
 * technicalData ингредиента, а не уже готовый packEquivalent — resolveInventoryPackEquivalent
 * (features/inventory/pack.ts) остаётся единственным мостом pack↔г/мл в проекте. */
export const formatQuantityWithPackHintFromTechnicalData = (
  quantity: number,
  unit: InventoryUnit,
  technicalData?: IngredientTechnicalData | null
): string => formatQuantityWithPackCountHint(quantity, unit, resolveInventoryPackEquivalent(technicalData ?? null));

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
  const displayUnit = resolveInventoryHumanDisplayUnit(input);
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
