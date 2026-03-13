import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn()
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/ingredients",
  useRouter: () => ({ replace: mocks.replace })
}));

vi.mock("../app/(app)/app/ingredients/actions", () => ({
  updateInventoryInlineAction: vi.fn(async () => ({ ok: true, message: "ok" })),
  updateInventoryItemAction: vi.fn(async () => ({ ok: true, message: "ok" })),
  deleteInventoryItemAction: vi.fn(async () => ({ ok: true, message: "ok" }))
}));

import { InventoryListItem } from "../components/inventory/inventory-list-item";
import {
  canMarkInventoryItemFinished,
  isInventoryQuantityDraftDirty,
  isInventoryQuantityValueValid
} from "../components/inventory/inventory-quantity-editor";
import { InventorySearchInput, buildInventorySuggestionParams } from "../components/inventory/inventory-search-input";
import { InventoryToolbar } from "../components/inventory/inventory-toolbar";
import type { InventoryListItemDto } from "../features/inventory/contracts";
import { buildInventoryToolbarHref, hasActiveInventoryFilters } from "../features/inventory/page-model";

describe("inventory usability components", () => {
  it("renders toolbar controls without submit-era archive UX", () => {
    const html = renderToStaticMarkup(React.createElement(InventoryToolbar, {
      search: "citra",
      category: "hop",
      showFinished: true,
      sort: "name"
    }));

    expect(html).toContain("Фильтры по запасам");
    expect(html).toContain("Категория");
    expect(html).toContain("Показывать закончившиеся");
    expect(html).toContain("Сортировка");
    expect(html).toContain("Сбросить фильтры");
    expect(html).not.toContain("Применить");
    expect(html).not.toContain("Остаток");
  });

  it("builds live URLs and inventory suggestion params", () => {
    expect(buildInventoryToolbarHref("/app/ingredients", {
      search: "citra",
      category: "hop",
      showFinished: true,
      sort: "name"
    })).toBe("/app/ingredients?search=citra&category=hop&finished=true&sort=name");

    expect(hasActiveInventoryFilters({
      search: "",
      category: "all",
      showFinished: false,
      sort: "default"
    })).toBe(false);

    expect(buildInventorySuggestionParams({
      q: "malt",
      category: "fermentable",
      showFinished: true,
      limit: 8
    }).toString()).toBe("q=malt&limit=8&category=fermentable&finished=true");
  });

  it("renders standalone search input without legacy category/archive controls", () => {
    const html = renderToStaticMarkup(React.createElement(InventorySearchInput, {
      value: "malt",
      category: "all",
      showFinished: false,
      onValueChange: () => undefined,
      onSuggestionSelect: () => undefined
    }));

    expect(html).toContain("Например, Citra или Pilsner Malt");
    expect(html).not.toContain("Показывать архивные");
  });

  it("renders always-inline quantity editor with finished shortcut", () => {
    const item: InventoryListItemDto = {
      id: "inv-1",
      enteredQuantity: 2,
      enteredUnit: "kg",
      normalizedQuantity: 2000,
      normalizedUnit: "g",
      unitDimension: "weight",
      purchasePriceMinor: 125000,
      purchaseCurrency: "RUB",
      purchaseQuantity: 5,
      purchaseQuantityUnit: "kg",
      purchaseQuantityNormalized: 5000,
      purchaseQuantityNormalizedUnit: "g",
      normalizedUnitCostMinorRub: 25,
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
        category: "fermentable",
        displayName: "Pilsner Malt",
        normalizedName: "pilsner-malt",
        manufacturer: "BESTMALZ",
        country: "DE",
        fermentableColorEbc: 3.5,
        fermentableExtractYieldPct: 80,
        summary: "3.5 EBC • 80%"
      }
    };

    const html = renderToStaticMarkup(React.createElement(InventoryListItem, {
      item,
      preferredCurrency: "RUB",
      currencyRates: { RUB: 100, USD: 7900, EUR: 9170 }
    }));

    expect(html).toContain("aria-label=\"Количество\"");
    expect(html).toContain("aria-label=\"Единица измерения\"");
    expect(html).not.toContain("Быстро изменить");
    expect(html).toContain("Закончился");
    expect(html).not.toContain("Сохранить количество");
    expect(html).not.toContain("Отменить изменения количества");
    expect(html).toContain("Редактировать карточку");
    expect(html).toContain("Удалить ингредиент");
    expect(html).toContain("Pilsner Malt");
    expect(html).toContain("2 kg");
    expect(html).toContain("3.5 EBC • 80%");
    expect(html).toContain("Производитель: BESTMALZ");
    expect(html).toContain("Цена покупки");
    expect(html).toContain("Цена за единицу");
  });

  it("tracks dirty state and zero-stock validity for inline editor logic", () => {
    expect(isInventoryQuantityDraftDirty("2", "kg", "2", "kg")).toBe(false);
    expect(isInventoryQuantityDraftDirty("2.5", "kg", "2", "kg")).toBe(true);
    expect(isInventoryQuantityDraftDirty("2", "g", "2", "kg")).toBe(true);
    expect(isInventoryQuantityValueValid("0")).toBe(true);
    expect(isInventoryQuantityValueValid("-1")).toBe(false);
    expect(canMarkInventoryItemFinished("2")).toBe(true);
    expect(canMarkInventoryItemFinished("0")).toBe(false);
  });
});
