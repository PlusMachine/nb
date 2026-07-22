import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  requireUser: vi.fn(async () => ({ id: "u-1", preferredCurrency: "RUB" })),
  listInventoryForUserWithMeta: vi.fn(async (): Promise<{
    items: Record<string, unknown>[];
    searchRescue: "layout" | null;
  }> => ({ items: [], searchRescue: null })),
  getInventorySummaries: vi.fn(async () => ({
    totalItems: 3,
    inStockItems: 2,
    emptyItems: 1,
    byCategory: { fermentable: 1, hop: 2, yeast: 0, water_treatment: 0, consumable: 0 },
    inStockByCategory: { fermentable: 1, hop: 1, yeast: 0, water_treatment: 0, consumable: 0 },
    byPrimaryGroup: { fermentable: 1, hop: 2, yeast: 0, water_treatment: 0, consumable_supply: 0, consumable_additive: 0 },
    inStockByPrimaryGroup: { fermentable: 1, hop: 1, yeast: 0, water_treatment: 0, consumable_supply: 0, consumable_additive: 0 },
    byFermentableSubtype: { malt: 1, fermentable: 0 },
    inStockByFermentableSubtype: { malt: 1, fermentable: 0 }
  }))
}));

vi.mock("../lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/ingredients",
  useRouter: () => ({ replace: mocks.replace })
}));
vi.mock("../features/inventory/service", () => ({
  listInventoryForUserWithMeta: mocks.listInventoryForUserWithMeta,
  getInventorySummaries: mocks.getInventorySummaries
}));
vi.mock("../features/system/currency-rates", () => ({
  listSystemCurrencyRates: vi.fn(async () => ({ RUB: 100, USD: 7900, EUR: 9170 }))
}));
vi.mock("../features/recipes/match-service", () => ({
  findBrewableRecipesForUser: vi.fn(async () => [])
}));
vi.mock("../features/ingredients/catalog-service", () => ({
  getIngredientPickerQuickStartByContext: vi.fn(async () => null),
  getIngredientSuggestionByRef: vi.fn(async () => null)
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

import { MyIngredientsContent } from "../app/(app)/app/ingredients/content";

describe("inventory page filters", () => {
  it("passes search/category/show-finished/sort query into service layer", async () => {
    const view = await MyIngredientsContent({
      searchParams: Promise.resolve({ search: "citra", category: "hop", finished: "true", sort: "name" })
    });
    const html = renderToStaticMarkup(view);

    expect(mocks.listInventoryForUserWithMeta).toHaveBeenCalledWith("u-1", {
      category: "hop",
      subtype: undefined,
      group: undefined,
      includeEmpty: true,
      stockState: "all",
      sort: "name",
      search: "citra"
    });
    expect(html).toContain("Фильтры по запасам");
  });

  it("hides empty items by default", async () => {
    await MyIngredientsContent({
      searchParams: Promise.resolve({ category: "hop" })
    });

    expect(mocks.listInventoryForUserWithMeta).toHaveBeenLastCalledWith("u-1", {
      category: "hop",
      subtype: undefined,
      group: undefined,
      includeEmpty: false,
      stockState: "in_stock",
      sort: "default",
      search: ""
    });
  });

  it("shows search-specific empty state", async () => {
    const view = await MyIngredientsContent({
      searchParams: Promise.resolve({ search: "zzz" })
    });
    const html = renderToStaticMarkup(view);

    expect(html).toContain("Ничего не найдено");
  });

  // С4 (rescue): строка «Возможно, вы имели в виду:» — только при
  // searchRescue === "layout" и непустом списке.
  it("показывает rescue-строку при searchRescue=\"layout\"", async () => {
    mocks.listInventoryForUserWithMeta.mockResolvedValueOnce({
      items: [{ id: "inv-1" }],
      searchRescue: "layout"
    });

    const view = await MyIngredientsContent({
      searchParams: Promise.resolve({ search: "vjpfbr" })
    });
    const html = renderToStaticMarkup(view);

    expect(html).toContain("Возможно, вы имели в виду:");
  });

  it("не показывает rescue-строку при searchRescue=null", async () => {
    mocks.listInventoryForUserWithMeta.mockResolvedValueOnce({
      items: [{ id: "inv-1" }],
      searchRescue: null
    });

    const view = await MyIngredientsContent({
      searchParams: Promise.resolve({ search: "citra" })
    });
    const html = renderToStaticMarkup(view);

    expect(html).not.toContain("Возможно, вы имели в виду:");
  });
});
