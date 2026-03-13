import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InventoryPriceInput } from "../components/inventory/inventory-price-input";

describe("inventory price input", () => {
  it("renders compact total-mode block with derived per-unit hint", () => {
    const html = renderToStaticMarkup(React.createElement(InventoryPriceInput, {
      preferredCurrency: "RUB",
      priceInputMode: "total",
      priceInputAmount: "1000",
      enteredQuantity: "5",
      enteredUnit: "kg",
      onPriceInputModeChange: () => undefined,
      onPriceInputAmountChange: () => undefined,
      category: "fermentable",
      defaultDisplayUnit: "g",
      allowedUnits: ["g", "kg", "oz", "lb"],
      measurementDimension: "weight"
    }));

    expect(html).toContain("За всё");
    expect(html).toContain("За единицу");
    expect(html).toContain("/ kg");
    expect(html).not.toContain("Куплено");
    expect(html).not.toContain("Ед. закупки");
  });

  it("renders per-unit mode against human-facing fermentable kilograms", () => {
    const html = renderToStaticMarkup(React.createElement(InventoryPriceInput, {
      preferredCurrency: "RUB",
      priceInputMode: "per_display_unit",
      priceInputAmount: "120",
      enteredQuantity: "250",
      enteredUnit: "g",
      onPriceInputModeChange: () => undefined,
      onPriceInputAmountChange: () => undefined,
      category: "fermentable",
      defaultDisplayUnit: "g",
      allowedUnits: ["g", "kg", "oz", "lb"],
      measurementDimension: "weight"
    }));

    expect(html).toContain("за kg");
    expect(html).toContain("Итого");
    expect(html).toContain("₽");
  });
});
