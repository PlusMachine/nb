import type { SystemCurrency, SystemCurrencyRateMap } from "../system/currency";
import { convertCurrencyMinorToRubMinor } from "../system/currency";

import {
  normalizeInventoryMeasurementForProfile,
  parseInventoryUnit,
  type InventoryUnit,
  type InventoryUnitProfile
} from "./units";

export const inventoryPriceInputModes = ["total", "per_display_unit"] as const;
export type InventoryPriceInputMode = (typeof inventoryPriceInputModes)[number];

export type InventoryPurchaseInput = {
  priceInputMode?: InventoryPriceInputMode | null;
  priceInputAmountMinor?: number | null;
  priceInputCurrency?: SystemCurrency | null;
  purchasePriceMinor?: number | null;
  purchaseCurrency?: SystemCurrency | null;
  purchaseQuantity?: number | null;
  purchaseQuantityUnit?: string | null;
};

export type InventoryPurchaseContext = {
  priceInputMode: InventoryPriceInputMode | null;
  priceInputAmountMinor: number | null;
  priceInputCurrency: SystemCurrency | null;
  purchasePriceMinor: number | null;
  purchaseCurrency: SystemCurrency | null;
  purchaseQuantity: number | null;
  purchaseQuantityUnit: InventoryUnit | null;
  purchaseQuantityNormalized: number | null;
  purchaseQuantityNormalizedUnit: InventoryUnit | null;
  normalizedUnitCostMinorRub: number | null;
};

export type InventoryPurchaseDerivationOptions = {
  defaultCurrency?: SystemCurrency | null;
  fallbackMeasurement?: {
    quantity: number;
    unit: InventoryUnit | string;
  } | null;
  displayMeasurement?: {
    quantity: number;
    unit: InventoryUnit;
  } | null;
};

type InventoryPriceComputation = {
  priceInputMode: InventoryPriceInputMode | null;
  priceInputAmountMinor: number | null;
  priceInputCurrency: SystemCurrency | null;
  purchasePriceMinor: number | null;
  purchaseCurrency: SystemCurrency | null;
  perDisplayUnitPriceMinor: number | null;
  priceDisplayUnit: InventoryUnit | null;
};

const resolvePriceInputMode = (value?: InventoryPriceInputMode | null): InventoryPriceInputMode => (
  value === "per_display_unit" ? "per_display_unit" : "total"
);

export const resolveInventoryPriceComputation = (
  input: InventoryPurchaseInput,
  options: InventoryPurchaseDerivationOptions = {}
): InventoryPriceComputation => {
  const legacyAmountMinor = input.purchasePriceMinor ?? null;
  const priceInputAmountMinor = input.priceInputAmountMinor ?? legacyAmountMinor;
  const priceInputMode = priceInputAmountMinor != null
    ? resolvePriceInputMode(input.priceInputMode ?? (legacyAmountMinor != null ? "total" : null))
    : null;
  const priceInputCurrency = priceInputAmountMinor != null
    ? input.priceInputCurrency ?? input.purchaseCurrency ?? options.defaultCurrency ?? "RUB"
    : null;
  const priceDisplayUnit = options.displayMeasurement?.unit
    ?? (
      options.fallbackMeasurement?.unit
        ? parseInventoryUnit(String(options.fallbackMeasurement.unit))
        : null
    );
  const displayQuantity = options.displayMeasurement?.quantity ?? options.fallbackMeasurement?.quantity ?? null;
  const purchasePriceMinor = priceInputAmountMinor == null
    ? null
    : priceInputMode === "per_display_unit"
      ? (
          displayQuantity != null && displayQuantity > 0
            ? Math.round(priceInputAmountMinor * displayQuantity)
            : null
        )
      : priceInputAmountMinor;
  const perDisplayUnitPriceMinor = priceInputAmountMinor == null
    ? null
    : priceInputMode === "per_display_unit"
      ? priceInputAmountMinor
      : (
          displayQuantity != null && displayQuantity > 0
            ? Math.round(priceInputAmountMinor / displayQuantity)
            : null
        );

  return {
    priceInputMode,
    priceInputAmountMinor,
    priceInputCurrency,
    purchasePriceMinor,
    purchaseCurrency: purchasePriceMinor != null ? priceInputCurrency : null,
    perDisplayUnitPriceMinor,
    priceDisplayUnit
  };
};

export const normalizeInventoryPurchaseContext = (
  profile: InventoryUnitProfile,
  input: InventoryPurchaseInput,
  rates: SystemCurrencyRateMap,
  options: InventoryPurchaseDerivationOptions = {}
): InventoryPurchaseContext => {
  const priceComputation = resolveInventoryPriceComputation(input, options);
  const purchasePriceMinor = priceComputation.purchasePriceMinor;
  const fallbackQuantity = purchasePriceMinor != null ? options.fallbackMeasurement?.quantity ?? null : null;
  const fallbackQuantityUnit = purchasePriceMinor != null && options.fallbackMeasurement?.unit
    ? parseInventoryUnit(String(options.fallbackMeasurement.unit))
    : null;
  const purchaseCurrency = priceComputation.purchaseCurrency;
  const purchaseQuantity = input.purchaseQuantity ?? fallbackQuantity;
  const purchaseQuantityUnit = input.purchaseQuantityUnit
    ? parseInventoryUnit(input.purchaseQuantityUnit)
    : fallbackQuantityUnit;

  if (purchaseQuantity != null && !purchaseQuantityUnit) {
    throw new Error("INVALID_PURCHASE_UNIT");
  }

  const normalizedPurchaseMeasurement = purchaseQuantity != null && purchaseQuantityUnit
    ? normalizeInventoryMeasurementForProfile(profile, purchaseQuantity, purchaseQuantityUnit)
    : null;

  const normalizedUnitCostMinorRub = purchasePriceMinor != null
    && purchaseCurrency
    && normalizedPurchaseMeasurement
      ? Math.round(
        convertCurrencyMinorToRubMinor(purchasePriceMinor, purchaseCurrency, rates)
          / normalizedPurchaseMeasurement.normalizedQuantity
      )
      : null;

  return {
    priceInputMode: priceComputation.priceInputMode,
    priceInputAmountMinor: priceComputation.priceInputAmountMinor,
    priceInputCurrency: priceComputation.priceInputCurrency,
    purchasePriceMinor,
    purchaseCurrency,
    purchaseQuantity,
    purchaseQuantityUnit,
    purchaseQuantityNormalized: normalizedPurchaseMeasurement?.normalizedQuantity ?? null,
    purchaseQuantityNormalizedUnit: normalizedPurchaseMeasurement?.normalizedUnit ?? null,
    normalizedUnitCostMinorRub
  };
};
