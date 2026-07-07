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

    expect(html).toContain("Цена за всё количество");
    expect(html).toContain("За всё");
    expect(html).toContain("За единицу");
    // 1000 ₽ за 5 кг → подсказка о цене за практическую единицу (кг, не "kg").
    // Intl.NumberFormat ставит неразрывный пробел перед "₽" — сравниваем
    // двумя частями по разные стороны от него, чтобы не зависеть от него.
    expect(html).toContain("≈ 200");
    expect(html).toContain("₽ / кг");
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

    expect(html).toContain("Цена за кг");
    // 120 ₽/кг * 250 г (= 0.25 кг практической единицы) → итог 30 ₽.
    expect(html).toContain("Итого: 30");
    expect(html).toContain("₽");
  });
});
