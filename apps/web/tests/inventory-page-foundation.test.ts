import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../components/inventory/add-ingredient-trigger", () => ({
  AddIngredientTrigger: () => React.createElement("button", { type: "button" }, "Добавить ингредиент")
}));
vi.mock("../app/(app)/app/ingredients/actions", () => ({
  updateInventoryInlineAction: vi.fn(async () => ({ ok: true, message: "ok" })),
  updateInventoryItemAction: vi.fn(async () => ({ ok: true, message: "ok" })),
  deleteInventoryItemAction: vi.fn(async () => ({ ok: true, message: "ok" }))
}));

import { GroupedInventoryList } from "../components/inventory/grouped-inventory-list";
import { InventoryEmptyState } from "../components/inventory/inventory-empty-state";
import { InventorySummary } from "../components/inventory/inventory-summary";
import { type InventoryListItemDto, type InventorySummaryDto } from "../features/inventory/contracts";
import { groupInventoryItems } from "../features/inventory/page-model";

const baseSummary: InventorySummaryDto = {
  totalItems: 3,
  activeItems: 2,
  archivedItems: 1,
  byType: {
    fermentable: 1,
    hop: 1,
    yeast: 0,
    sugar: 1,
    adjunct: 0,
    fining: 0,
    misc: 0
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
      type: "fermentable",
      displayName: "Pilsner Malt",
      normalizedName: "pilsner-malt"
    }
  },
  {
    id: "inv-2",
    enteredQuantity: 150,
    enteredUnit: "g",
    normalizedQuantity: 150,
    normalizedUnit: "g",
    unitDimension: "weight",
    purchasedAt: null,
    freshnessDate: null,
    notes: "Для IPA",
    archivedAt: null,
    createdAt: new Date("2025-01-02"),
    updatedAt: new Date("2025-01-02"),
    source: {
      sourceKind: "custom",
      sourceId: "cus-1",
      type: "hop",
      displayName: "Citra",
      normalizedName: "citra"
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
    const html = renderToStaticMarkup(React.createElement(GroupedInventoryList, { items }));

    expect(grouped.map((group) => group.type)).toEqual(["fermentable", "hop"]);
    expect(html).toContain("Ферментируемые");
    expect(html).toContain("Хмель");
    expect(html).toContain("Pilsner Malt");
    expect(html).toContain("Citra");
    expect(html).toContain("Удалить ингредиент");
  });

  it("renders summary block", () => {
    const html = renderToStaticMarkup(React.createElement(InventorySummary, { summary: baseSummary }));

    expect(html).toContain("Всего позиций");
    expect(html).toContain("Активные");
    expect(html).toContain("Архивные");
    expect(html).toContain("Ферментируемые");
    expect(html).toContain("Хмель");
  });

  it("renders error state message", async () => {
    const component = await import("../app/(app)/app/ingredients/error");
    const html = renderToStaticMarkup(React.createElement(component.default, { error: new Error("boom"), reset: () => undefined }));

    expect(html).toContain("Не удалось загрузить");
    expect(html).toContain("Повторить");
  });
});
