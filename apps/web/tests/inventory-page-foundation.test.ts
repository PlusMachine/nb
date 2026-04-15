import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../components/inventory/add-ingredient-trigger", () => ({
  AddIngredientTrigger: () => React.createElement("button", { type: "button" }, "Добавить ингредиент")
}));
vi.mock("@/app/(app)/app/ingredients/actions", () => ({
  updateInventoryInlineAction: vi.fn(async () => ({ ok: true, message: "ok" })),
  setInventoryItemEmptyAction: vi.fn(async () => ({ ok: true, message: "ok" })),
  updateInventoryItemAction: vi.fn(async () => ({ ok: true, message: "ok" })),
  deleteInventoryItemAction: vi.fn(async () => ({ ok: true, message: "ok" }))
}));

vi.mock("@/app/(app)/app/ingredients/metadata-actions", () => ({
  listIngredientPurchaseLinksAction: vi.fn(async () => []),
  createIngredientPurchaseLinkAction: vi.fn(async () => ({ ok: true })),
  updateIngredientPurchaseLinkAction: vi.fn(async () => ({ ok: true })),
  deleteIngredientPurchaseLinkAction: vi.fn(async () => ({ ok: true })),
  toggleIngredientFavoriteAction: vi.fn(async () => ({ ok: true, isFavorite: true }))
}));

import { GroupedInventoryList } from "../components/inventory/grouped-inventory-list";
import { InventoryEmptyState } from "../components/inventory/inventory-empty-state";
import { InventorySummary } from "../components/inventory/inventory-summary";
import { type InventoryListItemDto, type InventorySummaryDto } from "../features/inventory/contracts";
import { groupInventoryItems } from "../features/inventory/page-model";

const baseSummary: InventorySummaryDto = {
  totalItems: 4,
  inStockItems: 3,
  emptyItems: 1,
  byCategory: {
    fermentable: 2,
    hop: 2,
    yeast: 0,
    consumable: 0,
    water_treatment: 0
  },
  inStockByCategory: {
    fermentable: 2,
    hop: 1,
    yeast: 0,
    consumable: 0,
    water_treatment: 0
  },
  byPrimaryGroup: {
    fermentable: 2,
    hop: 2,
    yeast: 0,
    water_treatment: 0,
    consumable_supply: 0,
    consumable_additive: 0
  },
  inStockByPrimaryGroup: {
    fermentable: 2,
    hop: 1,
    yeast: 0,
    water_treatment: 0,
    consumable_supply: 0,
    consumable_additive: 0
  },
  byFermentableSubtype: {
    malt: 1,
    fermentable: 1
  },
  inStockByFermentableSubtype: {
    malt: 1,
    fermentable: 1
  }
};

const items: InventoryListItemDto[] = [
  {
    id: "inv-1",
    enteredQuantity: 2,
    enteredUnit: "kg",
    normalizedQuantity: 2000,
    normalizedUnit: "g",
    unitDimension: "weight",
    purchasedAt: null,
    freshnessDate: null,
    notes: null,
    archivedAt: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    source: {
      sourceKind: "catalog",
      sourceId: "cat-1",
      type: "malt",
      category: "fermentable",
      primaryLabelRu: "Пилснер солод",
      secondaryLabelRu: "Pilsner Malt",
      displayName: "Пилснер солод",
      normalizedName: "pilsner-malt"
    }
  },
  {
    id: "inv-2",
    enteredQuantity: 500,
    enteredUnit: "g",
    normalizedQuantity: 500,
    normalizedUnit: "g",
    unitDimension: "weight",
    purchasedAt: null,
    freshnessDate: null,
    notes: null,
    archivedAt: null,
    createdAt: new Date("2025-01-02"),
    updatedAt: new Date("2025-01-02"),
    source: {
      sourceKind: "catalog",
      sourceId: "cat-2",
      type: "fermentable",
      category: "fermentable",
      primaryLabelRu: "Декстроза",
      secondaryLabelRu: "Dextrose",
      displayName: "Декстроза",
      normalizedName: "dextrose"
    }
  },
  {
    id: "inv-3",
    enteredQuantity: 150,
    enteredUnit: "g",
    normalizedQuantity: 150,
    normalizedUnit: "g",
    unitDimension: "weight",
    purchasedAt: null,
    freshnessDate: null,
    notes: "Для IPA",
    archivedAt: null,
    createdAt: new Date("2025-01-03"),
    updatedAt: new Date("2025-01-03"),
    source: {
      sourceKind: "custom",
      sourceId: "cus-1",
      type: "hop",
      category: "hop",
      primaryLabelRu: "Citra",
      secondaryLabelRu: "Цитра",
      displayName: "Citra",
      normalizedName: "citra"
    }
  },
  {
    id: "inv-4",
    enteredQuantity: 0,
    enteredUnit: "item",
    normalizedQuantity: 0,
    normalizedUnit: "item",
    unitDimension: "count",
    purchasedAt: null,
    freshnessDate: null,
    notes: null,
    archivedAt: null,
    createdAt: new Date("2025-01-04"),
    updatedAt: new Date("2025-01-04"),
    source: {
      sourceKind: "custom",
      sourceId: "cus-2",
      type: "hop",
      category: "hop",
      primaryLabelRu: "Mosaic",
      secondaryLabelRu: null,
      displayName: "Mosaic",
      normalizedName: "mosaic"
    }
  }
];

describe("inventory page foundation", () => {
  it("renders empty state", () => {
    const html = renderToStaticMarkup(React.createElement(InventoryEmptyState));

    expect(html).toContain("Пока нет ингредиентов");
    expect(html).toContain("Добавить ингредиент");
  });

  it("renders grouped data", () => {
    const grouped = groupInventoryItems(items);
    const html = renderToStaticMarkup(React.createElement(GroupedInventoryList, {
      items,
      preferredCurrency: "RUB",
      currencyRates: { RUB: 100, USD: 7900, EUR: 9170 }
    }));

    expect(grouped.map((group) => group.key)).toEqual(["fermentable", "hop"]);
    expect(grouped.find((group) => group.key === "fermentable")?.items.map((item) => item.id)).toEqual(["inv-1", "inv-2"]);
    expect(grouped.find((group) => group.key === "hop")?.items.map((item) => item.id)).toEqual(["inv-3", "inv-4"]);
    expect(html).toContain("Сбраживаемые");
    expect(html).toContain("Хмель");
    expect(html).not.toContain("Закончившиеся");
    expect(html).toContain("Пилснер солод");
    expect(html).toContain("Декстроза");
    expect(html).toContain("Citra");
    expect(html).toContain("Mosaic");
    expect(html).toContain('aria-label="Удалить"');
  });

  it("keeps finished items in the incoming sort order within a group", () => {
    const sortedItems = [items[3], items[2], items[0]];
    const grouped = groupInventoryItems(sortedItems);

    expect(grouped.find((group) => group.key === "hop")?.items.map((item) => item.id)).toEqual(["inv-4", "inv-3"]);
  });

  it("uses fermentable subtype labels in empty states", () => {
    const html = renderToStaticMarkup(React.createElement(InventoryEmptyState, {
      hasAnyItems: true,
      hasFilters: true,
      category: "fermentable",
      subtype: "malt",
      showFinished: false
    }));

    expect(html).toContain("Солод");
    expect(html).not.toContain("Ферментируемые");
  });

  it("renders summary block", () => {
    const html = renderToStaticMarkup(React.createElement(InventorySummary, { summary: baseSummary }));

    expect(html).toContain("Всего позиций");
    expect(html).toContain("В наличии");
    expect(html).toContain("Пустые");
    expect(html).toContain("Сбраживаемые");
    expect(html).toContain("Хмель");
  });

  it("renders error state message", async () => {
    const component = await import("../app/(app)/app/ingredients/error");
    const html = renderToStaticMarkup(React.createElement(component.default, { error: new Error("boom"), reset: () => undefined }));

    expect(html).toContain("Не удалось загрузить");
    expect(html).toContain("Повторить");
  });
});
