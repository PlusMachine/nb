import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../app/(app)/app/ingredients/actions", () => ({
  updateInventoryInlineAction: vi.fn(async () => ({ ok: true, message: "ok" })),
  updateInventoryItemAction: vi.fn(async () => ({ ok: true, message: "ok" })),
  deleteInventoryItemAction: vi.fn(async () => ({ ok: true, message: "ok" }))
}));

import { InventoryArchivedToggle } from "../components/inventory/inventory-archived-toggle";
import { InventoryListItem } from "../components/inventory/inventory-list-item";
import { InventorySearchInput } from "../components/inventory/inventory-search-input";
import { InventoryToolbar } from "../components/inventory/inventory-toolbar";
import { InventoryTypeFilter } from "../components/inventory/inventory-type-filter";
import type { InventoryListItemDto } from "../features/inventory/contracts";

describe("inventory usability components", () => {
  it("renders toolbar controls", () => {
    const html = renderToStaticMarkup(React.createElement(InventoryToolbar, {
      search: "citra",
      type: "hop",
      archived: true
    }));

    expect(html).toContain("Фильтры по запасам");
    expect(html).toContain("name=\"search\"");
    expect(html).toContain("name=\"type\"");
    expect(html).toContain("Показывать архивные");
  });

  it("renders standalone toolbar subcomponents", () => {
    const html = renderToStaticMarkup(
        React.createElement("div", null,
        React.createElement(InventorySearchInput, { defaultValue: "malt", type: "all", archived: false }),
        React.createElement(InventoryTypeFilter, { value: "all" }),
        React.createElement(InventoryArchivedToggle, { checked: false })
      )
    );

    expect(html).toContain("inventory-search");
    expect(html).toContain("inventory-type-filter");
    expect(html).toContain("Показывать архивные");
  });

  it("renders inline quantity editor in item row", () => {
    const item: InventoryListItemDto = {
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
        normalizedName: "pilsner-malt",
        manufacturer: "BESTMALZ",
        country: "DE",
        fermentableColorEbc: 3.5,
        fermentableExtractYieldPct: 80
      }
    };

    const html = renderToStaticMarkup(React.createElement(InventoryListItem, { item }));

    expect(html).toContain("Быстро изменить");
    expect(html).toContain("Редактировать карточку");
    expect(html).toContain("Удалить ингредиент");
    expect(html).toContain("Pilsner Malt");
    expect(html).toContain("2 kg");
    expect(html).toContain("Цветность: 3,5 EBC");
    expect(html).toContain("Экстрактивность: 80%");
    expect(html).toContain("Производитель: BESTMALZ");
  });
});
