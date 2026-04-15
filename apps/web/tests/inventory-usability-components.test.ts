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

vi.mock("@/app/(app)/app/ingredients/actions", () => ({
  updateInventoryInlineAction: vi.fn(async () => ({ ok: true, message: "ok" })),
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

import { InventoryListItem } from "../components/inventory/inventory-list-item";
import {
  InventoryIngredientCategoryGrid,
  resolveInventoryIngredientCategoryValue,
  resolveInventoryIngredientContextFromCategoryValue
} from "../components/inventory/inventory-ingredient-category-grid";
import {
  InventoryItemDetailsEditor,
  resolveInventoryEditorQuickStartData,
  resolveInventoryEditorSelectionResetState,
  resolveInventoryEditorSelectionResetTaxonomy,
  shouldShowInventoryEditorOptionalSection,
  shouldShowInventoryEditorPickerStage,
  shouldShowInventoryEditorRequiredFields
} from "../components/inventory/inventory-item-details-editor";
import {
  canMarkInventoryItemFinished,
  isInventoryQuantityDraftDirty,
  isInventoryQuantityValueValid
} from "../components/inventory/inventory-quantity-editor";
import { InventorySearchInput, buildInventorySuggestionParams } from "../components/inventory/inventory-search-input";
import { InventoryToolbar, shouldShowInventorySearchInput } from "../components/inventory/inventory-toolbar";
import type { InventoryListItemDto } from "../features/inventory/contracts";
import { getInventoryUnitInputStep, getInventoryUnitQuantityPrecision } from "../features/inventory/units";
import {
  buildInventoryToolbarHref,
  hasActiveInventoryFilters,
  resolveInventoryShowFinished
} from "../features/inventory/page-model";

const createInventorySummary = (overrides?: Partial<Parameters<typeof InventoryToolbar>[0]["summary"]>) => ({
  totalItems: 0,
  inStockItems: 0,
  emptyItems: 0,
  byCategory: { fermentable: 0, hop: 0, yeast: 0, consumable: 0, water_treatment: 0 },
  inStockByCategory: { fermentable: 0, hop: 0, yeast: 0, consumable: 0, water_treatment: 0 },
  byPrimaryGroup: {
    fermentable: 0,
    hop: 0,
    yeast: 0,
    water_treatment: 0,
    consumable_supply: 0,
    consumable_additive: 0
  },
  inStockByPrimaryGroup: {
    fermentable: 0,
    hop: 0,
    yeast: 0,
    water_treatment: 0,
    consumable_supply: 0,
    consumable_additive: 0
  },
  byFermentableSubtype: { malt: 0, fermentable: 0 },
  inStockByFermentableSubtype: { malt: 0, fermentable: 0 },
  ...overrides
});

describe("inventory usability components", () => {
  it("uses the same ingredient category grid labels and subtype mapping as the add modal", () => {
    const html = renderToStaticMarkup(React.createElement(InventoryIngredientCategoryGrid, {
      value: "fermentable",
      onChange: () => undefined
    }));

    expect(html.indexOf("Сбраживаемые")).toBeLessThan(html.indexOf("Хмель"));
    expect(html.indexOf("Хмель")).toBeLessThan(html.indexOf("Дрожжи"));
    expect(html.indexOf("Дрожжи")).toBeLessThan(html.indexOf("Водоподготовка"));
    expect(html.indexOf("Водоподготовка")).toBeLessThan(html.indexOf("Расходники"));
    expect(html.indexOf("Расходники")).toBeLessThan(html.indexOf("Другие добавки"));
    expect(html).toContain("Сбраживаемые");
    expect(html).toContain("Хмель");
    expect(html).toContain("Дрожжи");
    expect(html).toContain("Водоподготовка");
    expect(html).toContain("Расходники");
    expect(html).toContain("Другие добавки");
    expect(html).toContain("text-amber-600");

    expect(resolveInventoryIngredientContextFromCategoryValue("fermentable")).toEqual({
      category: "fermentable",
      subtype: "fermentable",
      group: null
    });

    expect(resolveInventoryIngredientContextFromCategoryValue("consumable_supply")).toEqual({
      category: "consumable",
      subtype: null,
      group: "inventory_supplies"
    });

    expect(resolveInventoryIngredientCategoryValue({
      category: "fermentable",
      subtype: "malt"
    })).toBe("fermentable");
  });

  it("renders toolbar controls without submit-era archive UX", () => {
    const html = renderToStaticMarkup(React.createElement(InventoryToolbar, {
      search: "citra",
      category: "hop",
      subtype: null,
      group: null,
      showFinished: true,
      sort: "name",
      summary: createInventorySummary({
        totalItems: 10,
        inStockItems: 8,
        emptyItems: 2,
        byCategory: { fermentable: 3, hop: 4, yeast: 2, consumable: 1, water_treatment: 0 },
        inStockByCategory: { fermentable: 2, hop: 1, yeast: 2, consumable: 1, water_treatment: 0 },
        byPrimaryGroup: { fermentable: 3, hop: 4, yeast: 2, water_treatment: 0, consumable_supply: 1, consumable_additive: 0 },
        inStockByPrimaryGroup: { fermentable: 2, hop: 1, yeast: 2, water_treatment: 0, consumable_supply: 1, consumable_additive: 0 },
        byFermentableSubtype: { malt: 2, fermentable: 1 },
        inStockByFermentableSubtype: { malt: 1, fermentable: 1 }
      })
    }));

    expect(html).toContain("Фильтры по запасам");
    expect(html).toContain("Сбраживаемые");
    expect(html).toContain("Хмель");
    expect(html).toContain("Дрожжи");
    expect(html).toContain("Скрыть закончившиеся");
    expect(html).toContain("Сбросить");
    expect(html).toMatch(/Хмель<\/span><span[^>]*>4<\/span>/);
    expect(html).not.toContain("Применить");
    expect(html).not.toContain("Остаток");
  });

  it("uses in-stock counts on category tiles until empty items are revealed", () => {
    const html = renderToStaticMarkup(React.createElement(InventoryToolbar, {
      search: "",
      category: "all",
      subtype: null,
      group: null,
      showFinished: false,
      sort: "default",
      summary: createInventorySummary({
        totalItems: 3,
        inStockItems: 1,
        emptyItems: 2,
        byCategory: { fermentable: 0, hop: 3, yeast: 0, consumable: 0, water_treatment: 0 },
        inStockByCategory: { fermentable: 0, hop: 1, yeast: 0, consumable: 0, water_treatment: 0 },
        byPrimaryGroup: { fermentable: 0, hop: 3, yeast: 0, water_treatment: 0, consumable_supply: 0, consumable_additive: 0 },
        inStockByPrimaryGroup: { fermentable: 0, hop: 1, yeast: 0, water_treatment: 0, consumable_supply: 0, consumable_additive: 0 },
        byFermentableSubtype: { malt: 0, fermentable: 0 },
        inStockByFermentableSubtype: { malt: 0, fermentable: 0 }
      })
    }));

    expect(html).toContain("Показать закончившиеся");
    expect(html).toMatch(/Хмель<\/span><span[^>]*>1<\/span>/);
  });

  it("hides inventory search for short visible lists and keeps sorting above the list", () => {
    expect(shouldShowInventorySearchInput({ search: "", visibleItemCount: 12 })).toBe(false);
    expect(shouldShowInventorySearchInput({ search: "", visibleItemCount: 13 })).toBe(true);
    expect(shouldShowInventorySearchInput({ search: "citra", visibleItemCount: 3 })).toBe(true);

    const html = renderToStaticMarkup(React.createElement(InventoryToolbar, {
      search: "",
      category: "all",
      subtype: null,
      group: null,
      showFinished: false,
      sort: "default",
      visibleItemCount: 12,
      summary: createInventorySummary({
        totalItems: 12,
        inStockItems: 12,
        emptyItems: 0,
        byCategory: { fermentable: 4, hop: 4, yeast: 2, consumable: 1, water_treatment: 1 },
        inStockByCategory: { fermentable: 4, hop: 4, yeast: 2, consumable: 1, water_treatment: 1 },
        byPrimaryGroup: { fermentable: 4, hop: 4, yeast: 2, water_treatment: 1, consumable_supply: 0, consumable_additive: 1 },
        inStockByPrimaryGroup: { fermentable: 4, hop: 4, yeast: 2, water_treatment: 1, consumable_supply: 0, consumable_additive: 1 },
        byFermentableSubtype: { malt: 3, fermentable: 1 },
        inStockByFermentableSubtype: { malt: 3, fermentable: 1 }
      })
    }));

    expect(html).not.toContain("Поиск ингредиентов...");
    expect(html).toContain("По умолчанию");
  });

  it("renders zero counts on category tiles", () => {
    const html = renderToStaticMarkup(React.createElement(InventoryToolbar, {
      search: "",
      category: "all",
      subtype: null,
      group: null,
      showFinished: false,
      sort: "default",
      summary: createInventorySummary({
        totalItems: 0,
        inStockItems: 0,
        emptyItems: 0,
        byCategory: { fermentable: 0, hop: 0, yeast: 0, consumable: 0, water_treatment: 0 },
        inStockByCategory: { fermentable: 0, hop: 0, yeast: 0, consumable: 0, water_treatment: 0 },
        byPrimaryGroup: { fermentable: 0, hop: 0, yeast: 0, water_treatment: 0, consumable_supply: 0, consumable_additive: 0 },
        inStockByPrimaryGroup: { fermentable: 0, hop: 0, yeast: 0, water_treatment: 0, consumable_supply: 0, consumable_additive: 0 },
        byFermentableSubtype: { malt: 0, fermentable: 0 },
        inStockByFermentableSubtype: { malt: 0, fermentable: 0 }
      })
    }));

    expect(html).toContain("Сбраживаемые");
    expect(html).toContain("Хмель");
    expect(html).toContain(">Пусто</span>");
    expect(html).toContain("disabled");
    expect(html).not.toContain("Показать закончившиеся");
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

    expect(resolveInventoryShowFinished(true, { emptyItems: 0 })).toBe(false);
    expect(resolveInventoryShowFinished(true, { emptyItems: 2 })).toBe(true);

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

  it("renders malt brand inline with title and shows only the country flag", () => {
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
        brand: "BESTMALZ",
        countryCode: "DE",
        countryName: "Германия",
        technicalData: {
          type: "malt",
          maltType: "base",
          colorEbcMin: 6,
          colorEbcMax: 7,
          colorLovibond: 3.5,
          extractPctDryBasis: 80,
          proteinPct: null,
          maxUsagePct: 100,
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
    expect(html).toContain("BESTMALZ");
    expect(html).not.toContain("Германия");
    expect(html).toContain('value="2"');
    expect(html).toContain('step="0.01"');
    expect(html).toContain('<option value="kg" selected="">kg</option>');
    expect(html).toContain("6-7 EBC");
    expect(html).toContain("Экст-ть 80%");
    expect(html).toContain("до 100 % засыпи");
    expect(html).not.toContain("80% extract");
    expect(html).toContain("linear-gradient(180deg");
    expect(html).toContain("обнулить остаток");
    expect(html).toContain('aria-label="Редактировать"');
    expect(html).toContain('aria-label="Удалить"');
  });

  it("renders a finished status instead of the zero-out action for empty inventory items", () => {
    const item: InventoryListItemDto = {
      id: "inv-empty-1",
      enteredQuantity: 0,
      enteredUnit: "kg",
      normalizedQuantity: 0,
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
        sourceId: "cat-empty-1",
        type: "malt",
        category: "fermentable",
        subtype: "malt",
        primaryLabelRu: "Пилснер солод",
        secondaryLabelRu: "Pilsner Malt",
        displayName: "Пилснер солод",
        normalizedName: "pilsner-malt"
      }
    };

    const html = renderToStaticMarkup(React.createElement(InventoryListItem, {
      item,
      preferredCurrency: "RUB",
      currencyRates: { RUB: 100, USD: 7900, EUR: 9170 }
    }));

    expect(html).toContain("закончился");
    expect(html).toContain("text-pink-500");
    expect(html).not.toContain("обнулить остаток");
  });

  it("renders localized hop form badges instead of raw enum values", () => {
    const item: InventoryListItemDto = {
      id: "inv-hop-1",
      enteredQuantity: 100,
      enteredUnit: "g",
      normalizedQuantity: 100,
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
        sourceId: "cat-hop-1",
        type: "hop",
        category: "hop",
        primaryLabelRu: "Citra",
        secondaryLabelRu: "Цитра",
        displayName: "Citra",
        displayNameRu: "Цитра",
        normalizedName: "citra",
        technicalData: {
          type: "hop",
          alphaAcidPctTypical: 12.5,
          hopForm: "standard"
        }
      }
    };

    const html = renderToStaticMarkup(React.createElement(InventoryListItem, {
      item,
      preferredCurrency: "RUB",
      currencyRates: { RUB: 100, USD: 7900, EUR: 9170 }
    }));

    expect(html).toContain("Гранулы");
    expect(html).not.toContain("standard");
  });

  it("renders a compact buy entry with marketplace previews when purchase links exist", () => {
    const item: InventoryListItemDto = {
      id: "inv-buy-1",
      enteredQuantity: 100,
      enteredUnit: "g",
      normalizedQuantity: 100,
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
        sourceId: "cat-hop-1",
        type: "hop",
        category: "hop",
        primaryLabelRu: "Citra",
        secondaryLabelRu: null,
        displayName: "Citra",
        normalizedName: "citra",
        purchaseLinks: {
          count: 4,
          marketplaces: ["ozon", "wildberries", "yandex_market"]
        }
      }
    };

    const html = renderToStaticMarkup(React.createElement(InventoryListItem, {
      item,
      preferredCurrency: "RUB",
      currencyRates: { RUB: 100, USD: 7900, EUR: 9170 }
    }));

    expect(html).toContain(">Купить<");
    expect(html).toContain('title="Ozon"');
    expect(html).toContain('title="Wildberries"');
    expect(html).toContain('title="Яндекс Маркет"');
  });

  it("renders a single fermentable color value without an approximate marker", () => {
    const item: InventoryListItemDto = {
      id: "inv-fermentable-1",
      enteredQuantity: 1,
      enteredUnit: "kg",
      normalizedQuantity: 1000,
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
        sourceId: "cat-fermentable-1",
        type: "fermentable",
        category: "fermentable",
        subtype: "fermentable",
        familyId: null,
        familyDisplayName: null,
        primaryLabelRu: "Баварский пилснер",
        secondaryLabelRu: "Bavarian Pilsner",
        displayName: "Баварский пилснер",
        displayNameRu: "Баварский пилснер",
        displayNameEn: "Bavarian Pilsner",
        nameRu: "Баварский пилснер",
        nameEn: "Bavarian Pilsner",
        normalizedName: "bavarian-pilsner",
        brand: "Weyermann",
        producer: "Weyermann",
        brandName: "Weyermann",
        manufacturer: "Weyermann",
        countryCode: "DE",
        countryName: "Германия",
        country: "Германия",
        completenessLevel: "recommended",
        technicalData: {
          type: "fermentable",
          colorLovibond: 6.09,
          extractPctDryBasis: 75,
          recommendedMaxPct: 100
        },
        defaultDisplayUnit: "kg",
        allowedUnits: ["kg", "g"],
        measurementDimension: "weight",
        packageVariantId: null,
        packageVariantName: null,
        summary: "12 EBC • 75% extract",
        fermentableExtractYieldPct: 75,
        fermentableColorLovibond: 6.09,
        purchaseLinks: {
          count: 0,
          marketplaces: []
        }
      }
    };

    const html = renderToStaticMarkup(React.createElement(InventoryListItem, {
      item,
      preferredCurrency: "RUB",
      currencyRates: { RUB: 100, USD: 7900, EUR: 9170 }
    }));

    expect(html).toContain("12 EBC");
    expect(html).not.toContain("~12 EBC");
  });

  it("renders a calm add-link entry and does not spam favorites on inventory cards", () => {
    const item: InventoryListItemDto = {
      id: "inv-buy-2",
      enteredQuantity: 1,
      enteredUnit: "pack",
      normalizedQuantity: 1,
      normalizedUnit: "pack",
      unitDimension: "count",
      purchasedAt: null,
      freshnessDate: null,
      notes: null,
      archivedAt: null,
      createdAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-01"),
      source: {
        sourceKind: "custom",
        sourceId: "custom-yeast-1",
        type: "yeast",
        category: "yeast",
        primaryLabelRu: "US-05",
        secondaryLabelRu: null,
        displayName: "US-05",
        normalizedName: "us-05"
      }
    };

    const html = renderToStaticMarkup(React.createElement(InventoryListItem, {
      item,
      preferredCurrency: "RUB",
      currencyRates: { RUB: 100, USD: 7900, EUR: 9170 }
    }));

    expect(html).toContain(">Добавить ссылку<");
    expect(html).not.toContain("Добавить в избранное");
    expect(html).not.toContain("Убрать из избранного");
  });

  it("opens the inventory editor in selected state for the current stock item", () => {
    const item: InventoryListItemDto = {
      id: "inv-edit-1",
      enteredQuantity: 2,
      enteredUnit: "kg",
      normalizedQuantity: 2000,
      normalizedUnit: "g",
      unitDimension: "weight",
      priceInputMode: "total",
      priceInputAmountMinor: 89000,
      priceInputCurrency: "RUB",
      purchasePriceMinor: 89000,
      purchaseCurrency: "RUB",
      purchaseQuantity: 2,
      purchaseQuantityUnit: "kg",
      purchaseQuantityNormalized: 2000,
      purchaseQuantityNormalizedUnit: "g",
      normalizedUnitCostMinorRub: 45,
      purchasedAt: new Date("2025-01-10"),
      freshnessDate: null,
      notes: "Открыт мешок",
      archivedAt: null,
      createdAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-01"),
      source: {
        sourceKind: "catalog",
        sourceId: "cat-1",
        type: "fermentable",
        category: "fermentable",
        subtype: "malt",
        primaryLabelRu: "Пилснер",
        secondaryLabelRu: "Pilsner Malt",
        displayName: "Пилснер",
        displayNameRu: "Пилснер",
        normalizedName: "pilsner",
        brand: "Castle Malting",
        countryCode: "BE",
        countryName: "Бельгия",
        defaultDisplayUnit: "kg",
        allowedUnits: ["kg", "g"],
        measurementDimension: "weight",
        technicalData: {
          type: "malt",
          colorEbcMin: 3,
          colorEbcMax: 3,
          colorLovibond: 1.5,
          extractPctDryBasis: 81,
          proteinPct: null,
          maxUsagePct: 100,
          colorEbcIsApprox: false
        }
      }
    };

    const html = renderToStaticMarkup(React.createElement(InventoryItemDetailsEditor, {
      item,
      preferredCurrency: "RUB",
      currencyRates: { RUB: 100, USD: 7900, EUR: 9170 },
      initiallyOpen: true
    }));

    expect(html).toContain("Редактировать ингредиент на складе");
    expect(html).toContain('data-testid="inventory-editor-selection-stage"');
    expect(html).toContain('data-testid="inventory-editor-context-summary"');
    expect(html).toContain("Солод · Каталог");
    expect(html).toContain("Пилснер");
    expect(html).toContain("Заменить ингредиент");
    expect(html).toContain('data-testid="inventory-editor-required-fields"');
    expect(html).toContain("Количество *");
    expect(html).toContain("Ед. изм. *");
    expect(html).toContain('data-testid="inventory-editor-optional-disclosure"');
    expect(html).not.toContain('data-testid="inventory-editor-selection-controls"');
    expect(html).not.toContain('data-testid="inventory-editor-picker-stage"');
    expect(html).not.toContain('data-testid="ingredient-picker-quick-start"');
    expect(html).not.toContain("Начните вводить название ингредиента");
  });

  it("returns the inventory editor to picker stage when selection is cleared", () => {
    expect(resolveInventoryEditorSelectionResetState()).toEqual({
      pickerValue: "",
      shouldRefocus: true
    });
    expect(resolveInventoryEditorSelectionResetTaxonomy({
      category: "fermentable",
      subtype: "malt"
    })).toEqual({
      type: "malt",
      subtype: "malt"
    });
    expect(resolveInventoryEditorSelectionResetTaxonomy({
      category: "fermentable",
      subtype: "fermentable"
    })).toEqual({
      type: "fermentable",
      subtype: "fermentable"
    });

    expect(shouldShowInventoryEditorPickerStage({
      category: "hop",
      selected: null
    })).toBe(true);

    expect(shouldShowInventoryEditorPickerStage({
      category: "hop",
      selected: {
        id: "hop-1",
        type: "hop",
        category: "hop",
        displayName: "Citra",
        primaryLabelRu: "Citra",
        defaultUnit: "g",
        source: "catalog"
      }
    })).toBe(false);

    expect(shouldShowInventoryEditorRequiredFields(null)).toBe(false);
    expect(shouldShowInventoryEditorOptionalSection(null)).toBe(false);
  });

  it("resolves editor quick-start data for the currently selected picker context", () => {
    const quickStartByContext = {
      malt: {
        brands: [{
          type: "manufacturer" as const,
          label: "Castle Malting",
          normalizedLabel: "castle malting",
          value: "Castle Malting",
          count: 4,
          score: 40
        }],
        groups: [],
        recent: [],
        hasFavoritesAvailable: true,
        hasCustomAvailable: false
      },
      fermentable: {
        brands: [],
        groups: [{
          type: "consumable_group" as const,
          label: "Экстракты",
          normalizedLabel: "extract",
          value: "extract",
          count: 2,
          score: 20
        }],
        recent: [],
        hasFavoritesAvailable: false,
        hasCustomAvailable: false
      },
      hop: {
        brands: [],
        groups: [],
        recent: [],
        hasFavoritesAvailable: false,
        hasCustomAvailable: true
      },
      yeast: {
        brands: [],
        groups: [],
        recent: [],
        hasFavoritesAvailable: false,
        hasCustomAvailable: false
      },
      water_treatment: {
        brands: [],
        groups: [],
        recent: [],
        hasFavoritesAvailable: false,
        hasCustomAvailable: false
      },
      consumable: {
        brands: [],
        groups: [],
        recent: [],
        hasFavoritesAvailable: false,
        hasCustomAvailable: false
      }
    };

    expect(resolveInventoryEditorQuickStartData({
      category: "fermentable",
      subtype: "malt",
      initialQuickStartDataByContext: quickStartByContext
    })?.brands[0]?.label).toBe("Castle Malting");

    expect(resolveInventoryEditorQuickStartData({
      category: "fermentable",
      subtype: "fermentable",
      initialQuickStartDataByContext: quickStartByContext
    })?.groups?.[0]?.label).toBe("Экстракты");

    expect(resolveInventoryEditorQuickStartData({
      category: "hop",
      subtype: null,
      initialQuickStartDataByContext: quickStartByContext
    })?.hasCustomAvailable).toBe(true);
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
        brand: "Fermentis",
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
    expect(html).toContain("Fermentis");
    expect(html).toContain("Атт. 78%");
    expect(html).toContain("18-24°C");
  });

  it("renders canadian flag for lallemand yeast instead of fallback stripes", () => {
    const item: InventoryListItemDto = {
      id: "inv-yeast-ca-1",
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
        sourceId: "lallemand-philly-sour",
        type: "yeast",
        category: "yeast",
        primaryLabelRu: "Филли Сауэр",
        secondaryLabelRu: "WildBrew Philly Sour",
        displayName: "Филли Сауэр",
        normalizedName: "philly-sour",
        brand: "Lallemand",
        countryCode: "CA",
        countryName: "Canada",
        technicalData: {
          type: "yeast",
          form: "dry",
          attenuationPctTypical: 78,
          fermentationTempCMin: 20,
          fermentationTempCMax: 30
        }
      }
    };

    const html = renderToStaticMarkup(React.createElement(InventoryListItem, {
      item,
      preferredCurrency: "RUB",
      currencyRates: { RUB: 100, USD: 7900, EUR: 9170 }
    }));

    expect(html).toContain("Lallemand");
    expect(html).toContain("#D80621");
    expect(html).not.toContain("#E4E4E7");
  });

  it("renders hop country flag on the brand line instead of the title row", () => {
    const item: InventoryListItemDto = {
      id: "inv-hop-1",
      enteredQuantity: 100,
      enteredUnit: "g",
      normalizedQuantity: 100,
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
        sourceId: "hop-1",
        type: "hop",
        category: "hop",
        primaryLabelRu: "Цитра",
        secondaryLabelRu: "Citra",
        displayName: "Цитра",
        normalizedName: "citra",
        brand: "Yakima Chief",
        countryCode: "US",
        countryName: "США",
        technicalData: {
          type: "hop",
          alphaAcidPctTypical: 12,
          hopForm: "pellet"
        }
      }
    };

    const html = renderToStaticMarkup(React.createElement(InventoryListItem, {
      item,
      preferredCurrency: "RUB",
      currencyRates: { RUB: 100, USD: 7900, EUR: 9170 }
    }));

    expect(html).toContain("Цитра");
    expect(html).toContain("Citra");
    expect(html).toContain("Yakima Chief");
    expect(html).toContain("Альфа 12%");
    expect(html).toContain("Гранулы");
    expect(html).toMatch(/Yakima Chief.*svg/);
  });

  it("renders fermentable kind near the title and keeps brand on the lower line like hops", () => {
    const item: InventoryListItemDto = {
      id: "inv-ferm-1",
      enteredQuantity: 1,
      enteredUnit: "kg",
      normalizedQuantity: 1000,
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
        sourceId: "ferm-1",
        type: "fermentable",
        category: "fermentable",
        subtype: "fermentable",
        itemKind: "malt_extract",
        primaryLabelRu: "Баварский пилснер",
        secondaryLabelRu: "Bavarian Pilsner",
        displayName: "Баварский пилснер",
        normalizedName: "bavarian-pilsner",
        producer: "Weyermann",
        countryCode: "DE",
        countryName: "Германия",
        technicalData: {
          type: "fermentable",
          extractForm: "liquid",
          extractPctDryBasis: 75,
          colorLovibond: 6.1,
          recommendedMaxPct: 100
        }
      }
    };

    const html = renderToStaticMarkup(React.createElement(InventoryListItem, {
      item,
      preferredCurrency: "RUB",
      currencyRates: { RUB: 100, USD: 7900, EUR: 9170 }
    }));

    expect(html).toContain("Баварский пилснер");
    expect(html).toContain("Жидкий солодовый экстракт");
    expect(html).toContain("Weyermann");
    expect(html).toMatch(/Weyermann.*svg/);
    expect(html).toMatch(/Weyermann.*Жидкий солодовый экстракт/);
    expect(html).toContain("до 100 % засыпи");
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

  it("uses practical quantity steps for inventory units", () => {
    expect(getInventoryUnitQuantityPrecision("ml")).toBe(1);
    expect(getInventoryUnitInputStep("ml")).toBe(0.1);
    expect(getInventoryUnitQuantityPrecision("g")).toBe(1);
    expect(getInventoryUnitInputStep("g")).toBe(0.1);
    expect(getInventoryUnitQuantityPrecision("l")).toBe(2);
    expect(getInventoryUnitInputStep("l")).toBe(0.01);
    expect(getInventoryUnitQuantityPrecision("kg")).toBe(2);
    expect(getInventoryUnitInputStep("kg")).toBe(0.01);
    expect(getInventoryUnitQuantityPrecision("pack")).toBe(0);
    expect(getInventoryUnitInputStep("pack")).toBe(1);
  });
});
