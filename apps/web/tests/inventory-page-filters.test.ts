import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  requireUser: vi.fn(async () => ({ id: "u-1", preferredCurrency: "RUB" })),
  listInventoryForUser: vi.fn(async () => []),
  getInventorySummaries: vi.fn(async () => ({
    totalItems: 3,
    inStockItems: 3,
    emptyItems: 0,
    byCategory: { fermentable: 1, hop: 2, yeast: 0, water_treatment: 0, consumable: 0 },
    byFermentableSubtype: { malt: 1, fermentable: 0 }
  }))
}));

vi.mock("../lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/ingredients",
  useRouter: () => ({ replace: mocks.replace })
}));
vi.mock("../features/inventory/service", () => ({
  listInventoryForUser: mocks.listInventoryForUser,
  getInventorySummaries: mocks.getInventorySummaries
}));
vi.mock("../features/system/currency-rates", () => ({
  listSystemCurrencyRates: vi.fn(async () => ({ RUB: 100, USD: 7900, EUR: 9170 }))
}));
vi.mock("../components/inventory/add-ingredient-trigger", () => ({
  AddIngredientTrigger: () => React.createElement("button", { type: "button" }, "Добавить")
}));
vi.mock("../components/inventory/grouped-inventory-list", () => ({
  GroupedInventoryList: () => React.createElement("div", null, "LIST")
}));
vi.mock("../components/inventory/inventory-summary", () => ({
  InventorySummary: () => React.createElement("div", null, "SUMMARY")
}));

import MyIngredientsPage from "../app/(app)/app/ingredients/page";

describe("inventory page filters", () => {
  it("passes search/category/sort query into service layer and keeps empty items visible", async () => {
    const view = await MyIngredientsPage({
      searchParams: Promise.resolve({ search: "citra", category: "hop", sort: "name" })
    });
    const html = renderToStaticMarkup(view);

    expect(mocks.listInventoryForUser).toHaveBeenCalledWith("u-1", {
      category: "hop",
      includeEmpty: true,
      stockState: "all",
      sort: "name",
      search: "citra"
    });
    expect(html).toContain("Фильтры по запасам");
  });

  it("shows search-specific empty state", async () => {
    const view = await MyIngredientsPage({
      searchParams: Promise.resolve({ search: "zzz" })
    });
    const html = renderToStaticMarkup(view);

    expect(html).toContain("По вашему запросу ничего не найдено");
  });
});
