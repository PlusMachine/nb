import type { SystemCurrency, SystemCurrencyRateMap } from "../system/currency";
import { convertCurrencyMinorToRubMinor } from "../system/currency";

import {
  normalizeInventoryMeasurementForProfile,
  parseInventoryUnit,
  type InventoryUnit,
  type InventoryUnitProfile
} from "./units";

export type InventoryPurchaseInput = {
  purchasePriceMinor?: number | null;
  purchaseCurrency?: SystemCurrency | null;
  purchaseQuantity?: number | null;
  purchaseQuantityUnit?: string | null;
};

export type InventoryPurchaseContext = {
  purchasePriceMinor: number | null;
  purchaseCurrency: SystemCurrency | null;
  purchaseQuantity: number | null;
  purchaseQuantityUnit: InventoryUnit | null;
  purchaseQuantityNormalized: number | null;
  purchaseQuantityNormalizedUnit: InventoryUnit | null;
  normalizedUnitCostMinorRub: number | null;
};

export const normalizeInventoryPurchaseContext = (
  profile: InventoryUnitProfile,
  input: InventoryPurchaseInput,
  rates: SystemCurrencyRateMap
): InventoryPurchaseContext => {
  const purchasePriceMinor = input.purchasePriceMinor ?? null;
  const purchaseCurrency = input.purchaseCurrency ?? null;
  const purchaseQuantity = input.purchaseQuantity ?? null;
  const purchaseQuantityUnit = input.purchaseQuantityUnit ? parseInventoryUnit(input.purchaseQuantityUnit) : null;

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
    purchasePriceMinor,
    purchaseCurrency,
    purchaseQuantity,
    purchaseQuantityUnit,
    purchaseQuantityNormalized: normalizedPurchaseMeasurement?.normalizedQuantity ?? null,
    purchaseQuantityNormalizedUnit: normalizedPurchaseMeasurement?.normalizedUnit ?? null,
    normalizedUnitCostMinorRub
  };
};
