import { describe, expect, it } from "vitest";

import { normalizeInventoryPurchaseContext } from "../features/inventory/purchase-cost";
import { defaultSystemCurrencyRates } from "../features/system/currency-rates";

describe("inventory purchase cost foundation", () => {
  it("normalizes purchase quantity and rub unit cost", () => {
    const purchase = normalizeInventoryPurchaseContext({
      defaultUnit: "kg",
      allowedUnits: ["g", "kg"],
      measurementDimension: "weight"
    }, {
      purchasePriceMinor: 125000,
      purchaseCurrency: "RUB",
      purchaseQuantity: 5,
      purchaseQuantityUnit: "kg"
    }, defaultSystemCurrencyRates);

    expect(purchase).toEqual({
      purchasePriceMinor: 125000,
      purchaseCurrency: "RUB",
      purchaseQuantity: 5,
      purchaseQuantityUnit: "kg",
      purchaseQuantityNormalized: 5000,
      purchaseQuantityNormalizedUnit: "g",
      normalizedUnitCostMinorRub: 25
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
});
