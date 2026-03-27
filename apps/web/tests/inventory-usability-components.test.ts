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
      sort: "name",
      summary: {
        totalItems: 10,
        inStockItems: 8,
        emptyItems: 2,
        byCategory: { fermentable: 3, hop: 4, yeast: 2, consumable: 1, water_treatment: 0 }
      }
    }));

    expect(html).toContain("Фильтры по запасам");
    expect(html).toContain("Ферментируемые");
    expect(html).toContain("Хмель");
    expect(html).toContain("Дрожжи");
    expect(html).toContain("Закончившиеся");
    expect(html).toContain("Сбросить");
    expect(html).not.toContain("Применить");
    expect(html).not.toContain("Остаток");
  });

  it("renders zero counts on category tiles", () => {
    const html = renderToStaticMarkup(React.createElement(InventoryToolbar, {
      search: "",
      category: "all",
      showFinished: false,
      sort: "default",
      summary: {
        totalItems: 0,
        inStockItems: 0,
        emptyItems: 0,
        byCategory: { fermentable: 0, hop: 0, yeast: 0, consumable: 0, water_treatment: 0 }
      }
    }));

    expect(html).toContain("Ферментируемые");
    expect(html).toContain("Хмель");
    expect(html).toContain(">Пусто</span>");
    expect(html).toContain("disabled");
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

    expect(html).toContain("Поиск ингредиентов...");
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
        type: "malt",
        category: "fermentable",
        primaryLabelRu: "Пилснер солод",
        secondaryLabelRu: "Pilsner Malt",
        displayName: "Пилснер солод",
        displayNameRu: "Пилснер солод",
        normalizedName: "pilsner-malt",
        manufacturer: "BESTMALZ",
        country: "DE",
        technicalData: {
          type: "malt",
          maltType: "base",
          colorEbcMin: 6,
          colorEbcMax: 7,
          colorLovibond: 3.5,
          extractPctDryBasis: 80,
          proteinPct: null,
          maxUsagePct: null,
          colorEbcIsApprox: false
        },
        summary: "3.5 Lovibond • 80% extract"
      }
    };

    const html = renderToStaticMarkup(React.createElement(InventoryListItem, {
      item,
      preferredCurrency: "RUB",
      currencyRates: { RUB: 100, USD: 7900, EUR: 9170 }
    }));

    expect(html).toContain("Пилснер солод");
    expect(html).toContain("Pilsner Malt");
    expect(html).toContain('value="2"');
    expect(html).toContain('<option value="kg" selected="">kg</option>');
    expect(html).toContain("BESTMALZ");
    expect(html).toContain("6-7 EBC");
    expect(html).toContain("Экстракт 80%");
    expect(html).toContain('aria-label="Редактировать"');
    expect(html).toContain('aria-label="Удалить"');
  });

  it("shows dry yeast pack quantity with gram equivalent", () => {
    const item: InventoryListItemDto = {
      id: "inv-yeast-1",
      enteredQuantity: 1,
      enteredUnit: "pack",
      normalizedQuantity: 11,
      normalizedUnit: "g",
      unitDimension: "weight",
      purchasePriceMinor: null,
      purchaseCurrency: null,
      purchaseQuantity: null,
      purchaseQuantityUnit: null,
      purchaseQuantityNormalized: null,
      purchaseQuantityNormalizedUnit: null,
      normalizedUnitCostMinorRub: null,
      purchasedAt: null,
      freshnessDate: null,
      notes: null,
      archivedAt: null,
      createdAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-01"),
      source: {
        sourceKind: "catalog",
        sourceId: "yeast-1",
        type: "yeast",
        category: "yeast",
        primaryLabelRu: "US-05",
        secondaryLabelRu: null,
        displayName: "US-05",
        normalizedName: "us-05",
        technicalData: {
          type: "yeast",
          form: "dry",
          attenuationPctTypical: 78,
          fermentationTempCMin: 18,
          fermentationTempCMax: 24,
          flocculation: null,
          alcoholToleranceAbvTypical: null,
          packageSize: null,
          packageUnit: null
        }
      }
    };

    const html = renderToStaticMarkup(React.createElement(InventoryListItem, {
      item,
      preferredCurrency: "RUB",
      currencyRates: { RUB: 100, USD: 7900, EUR: 9170 }
    }));

    expect(html).toContain('<option value="pack" selected="">pack (пачка)</option>');
    expect(html).toContain("1 pack (11 g)");
    expect(html).toContain("Атт. 78%");
    expect(html).toContain("18-24°C");
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
