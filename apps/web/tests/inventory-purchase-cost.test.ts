import { describe, expect, it } from "vitest";

import {
  normalizeInventoryPurchaseContext,
  resolveInventoryPriceComputation
} from "../features/inventory/purchase-cost";
import { defaultSystemCurrencyRates } from "../features/system/currency";

describe("inventory purchase cost foundation", () => {
  it("normalizes purchase quantity and rub unit cost in total mode", () => {
    const purchase = normalizeInventoryPurchaseContext({
      defaultUnit: "kg",
      allowedUnits: ["g", "kg"],
      measurementDimension: "weight"
    }, {
      priceInputMode: "total",
      priceInputAmountMinor: 125000,
      priceInputCurrency: "RUB"
    }, defaultSystemCurrencyRates, {
      displayMeasurement: {
        quantity: 5,
        unit: "kg"
      },
      fallbackMeasurement: {
        quantity: 5,
        unit: "kg"
      }
    });

    expect(purchase).toEqual({
      priceInputMode: "total",
      priceInputAmountMinor: 125000,
      priceInputCurrency: "RUB",
      purchasePriceMinor: 125000,
      purchaseCurrency: "RUB",
      purchaseQuantity: 5,
      purchaseQuantityUnit: "kg",
      purchaseQuantityNormalized: 5000,
      purchaseQuantityNormalizedUnit: "g",
      normalizedUnitCostMinorRub: 25
    });
  });

  it("derives purchase quantity from the entered inventory amount when only total price is given", () => {
    const purchase = normalizeInventoryPurchaseContext({
      defaultUnit: "kg",
      allowedUnits: ["g", "kg"],
      measurementDimension: "weight"
    }, {
      priceInputMode: "total",
      priceInputAmountMinor: 125000
    }, defaultSystemCurrencyRates, {
      defaultCurrency: "USD",
      displayMeasurement: {
        quantity: 5,
        unit: "kg"
      },
      fallbackMeasurement: {
        quantity: 5,
        unit: "kg"
      }
    });

    expect(purchase).toEqual({
      priceInputMode: "total",
      priceInputAmountMinor: 125000,
      priceInputCurrency: "USD",
      purchasePriceMinor: 125000,
      purchaseCurrency: "USD",
      purchaseQuantity: 5,
      purchaseQuantityUnit: "kg",
      purchaseQuantityNormalized: 5000,
      purchaseQuantityNormalizedUnit: "g",
      normalizedUnitCostMinorRub: 1975
    });
  });

  it("derives total purchase price from per-display-unit input", () => {
    const purchase = normalizeInventoryPurchaseContext({
      defaultUnit: "kg",
      allowedUnits: ["g", "kg"],
      measurementDimension: "weight"
    }, {
      priceInputMode: "per_display_unit",
      priceInputAmountMinor: 12000,
      priceInputCurrency: "RUB"
    }, defaultSystemCurrencyRates, {
      displayMeasurement: {
        quantity: 0.25,
        unit: "kg"
      },
      fallbackMeasurement: {
        quantity: 250,
        unit: "g"
      }
    });

    expect(purchase).toEqual({
      priceInputMode: "per_display_unit",
      priceInputAmountMinor: 12000,
      priceInputCurrency: "RUB",
      purchasePriceMinor: 3000,
      purchaseCurrency: "RUB",
      purchaseQuantity: 250,
      purchaseQuantityUnit: "g",
      purchaseQuantityNormalized: 250,
      purchaseQuantityNormalizedUnit: "g",
      normalizedUnitCostMinorRub: 12
    });
  });

  it("keeps nullable fields safe when only quantity context is known", () => {
    const purchase = normalizeInventoryPurchaseContext({
      defaultUnit: "g",
      allowedUnits: ["g", "oz"],
      measurementDimension: "weight"
    }, {
      purchaseQuantity: 2,
      purchaseQuantityUnit: "oz"
    }, defaultSystemCurrencyRates);

    expect(purchase.purchasePriceMinor).toBeNull();
    expect(purchase.purchaseCurrency).toBeNull();
    expect(purchase.purchaseQuantityNormalized).toBeCloseTo(56.699, 3);
    expect(purchase.purchaseQuantityNormalizedUnit).toBe("g");
    expect(purchase.normalizedUnitCostMinorRub).toBeNull();
  });

  it("computes preview context for total and per-unit modes", () => {
    expect(resolveInventoryPriceComputation({
      priceInputMode: "total",
      priceInputAmountMinor: 100000,
      priceInputCurrency: "RUB"
    }, {
      displayMeasurement: {
        quantity: 5,
        unit: "kg"
      }
    })).toMatchObject({
      purchasePriceMinor: 100000,
      perDisplayUnitPriceMinor: 20000,
      priceDisplayUnit: "kg"
    });

    expect(resolveInventoryPriceComputation({
      priceInputMode: "per_display_unit",
      priceInputAmountMinor: 12000,
      priceInputCurrency: "RUB"
    }, {
      displayMeasurement: {
        quantity: 5,
        unit: "kg"
      }
    })).toMatchObject({
      purchasePriceMinor: 60000,
      perDisplayUnitPriceMinor: 12000,
      priceDisplayUnit: "kg"
    });
  });
});
