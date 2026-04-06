import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  userId: "u1",
  preferredCurrency: "USD",
  refresh: vi.fn(),
  revalidated: [] as string[],
  createdCustomId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
  resolveCatalogSourceMode: "catalog" as "catalog" | "custom",
  resolveCatalogSourceCalls: [] as any[],
  addCatalogCalls: [] as any[],
  createCustomCalls: [] as any[],
  addCustomCalls: [] as any[],
  updateItemCalls: [] as any[],
  replacePurchaseLinkCalls: [] as any[]
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockState.refresh
  })
}));

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");

  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => mockState.revalidated.push(path)
}));

vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ id: mockState.userId, preferredCurrency: mockState.preferredCurrency })
}));

vi.mock("@/features/inventory/service", () => ({
  resolveCatalogInventoryAdditionSource: async (_userId: string, payload: any) => {
    mockState.resolveCatalogSourceCalls.push(payload);

    if (mockState.resolveCatalogSourceMode === "custom") {
      return {
        sourceKind: "custom",
        userCustomIngredientId: mockState.createdCustomId
      };
    }

    return {
      sourceKind: "catalog",
      ingredientCatalogItemId: payload.ingredientCatalogItemId
    };
  },
  addCatalogIngredientToInventory: async (_userId: string, payload: unknown) => {
    mockState.addCatalogCalls.push(payload);
    return { id: "inv-cat" };
  },
  createUserCustomIngredient: async (_userId: string, payload: unknown) => {
    mockState.createCustomCalls.push(payload);
    return { id: mockState.createdCustomId };
  },
  addCustomIngredientToInventory: async (_userId: string, payload: unknown) => {
    mockState.addCustomCalls.push(payload);
    return { id: "inv-custom" };
  },
  updateInventoryItem: async (_userId: string, inventoryItemId: string, payload: unknown) => {
    mockState.updateItemCalls.push({ inventoryItemId, payload });
    return { id: inventoryItemId };
  },
  updateInventoryQuantity: async () => ({ id: "inv-updated" }),
  setInventoryItemQuantityToZero: async () => ({ id: "inv-updated" }),
  deleteInventoryItem: async () => undefined
}));

vi.mock("@/features/ingredients/user-metadata-service", () => ({
  replaceIngredientPurchaseLinksForReference: async (_userId: string, reference: unknown, urls: string[]) => {
    mockState.replacePurchaseLinkCalls.push({ reference, urls });
    return [];
  }
}));

vi.mock("@/app/(app)/app/ingredients/metadata-actions", () => ({
  listIngredientPurchaseLinksAction: vi.fn(async () => []),
  createIngredientPurchaseLinkAction: vi.fn(async () => ({ ok: true })),
  updateIngredientPurchaseLinkAction: vi.fn(async () => ({ ok: true })),
  deleteIngredientPurchaseLinkAction: vi.fn(async () => ({ ok: true })),
  toggleIngredientFavoriteAction: vi.fn(async () => ({ ok: true, isFavorite: true }))
}));


import {
  addCatalogIngredientAction,
  addCustomIngredientAction,
  addSelectedIngredientAction,
  updateInventoryItemAction
} from "../app/(app)/app/ingredients/actions";
import { IngredientCategorySelector } from "../components/ingredients/ingredient-category-selector";
import { buildIngredientSearchParams } from "../components/ingredients/ingredient-picker";
import {
  AddIngredientModal,
  applyAddIngredientImmediateControlAction,
  applyAddIngredientSuccessEffects,
  resolveAddIngredientStartCategoryValue,
  shouldApplyAddIngredientControlActionOnClick,
  shouldCloseAddIngredientModalFromBackdropInteraction
} from "../components/inventory/add-ingredient-modal";
import { AddIngredientTrigger } from "../components/inventory/add-ingredient-trigger";
import {
  buildCatalogIngredientPayload,
  CatalogIngredientForm,
  hasCatalogIngredientTechnicalOverrides,
  resolveCatalogDerivedVariantPresentation,
  resolveCatalogBatchOverrideSummaryState,
  resolveCatalogPickerContextChange,
  resolveCatalogSelectionResetState,
  resolveCatalogBatchOverrideDefaults,
  resolveCatalogIngredientUnitProfile,
  shouldShowCatalogOptionalSection,
  shouldShowCatalogPickerStage,
  shouldShowCatalogRequiredInventoryBlock
} from "../components/inventory/catalog-ingredient-form";
import { CustomIngredientPanel } from "../components/inventory/custom-ingredient-panel";
import { CustomIngredientForm, getCustomIngredientSubtypeOptions } from "../components/inventory/custom-ingredient-form";
import { getTodayDateInputValue } from "../components/inventory/date-input";
import {
  createInitialInventoryOptionalFields,
  InventoryOptionalDisclosure,
  resolveInventoryOptionalDisclosureSummary
} from "../components/inventory/inventory-optional-disclosure";

describe("inventory add-flow", () => {
  beforeEach(() => {
    mockState.refresh.mockReset();
    mockState.revalidated = [];
    mockState.resolveCatalogSourceMode = "catalog";
    mockState.resolveCatalogSourceCalls = [];
    mockState.addCatalogCalls = [];
    mockState.createCustomCalls = [];
    mockState.addCustomCalls = [];
    mockState.updateItemCalls = [];
    mockState.replacePurchaseLinkCalls = [];
  });

  it("renders CTA trigger", () => {
    const html = renderToStaticMarkup(React.createElement(AddIngredientTrigger));
    expect(html).toContain("Добавить ингредиент");
  });

  it("renders add flow in selection stage before an ingredient is chosen", () => {
    const html = renderToStaticMarkup(React.createElement(AddIngredientModal, {
      open: true,
      onClose: () => undefined
    }));

    expect(html).toContain("Добавить ингредиент");
    expect(html).toContain('data-testid="add-ingredient-category-grid"');
    expect(html).toContain('data-testid="add-ingredient-mode-switch"');
    expect(html).toContain("Начните вводить название ингредиента");
    expect(html).not.toContain('data-testid="catalog-required-fields"');
    expect(html).not.toContain('data-testid="catalog-batch-overrides"');
    expect(html).not.toContain('data-testid="catalog-optional-disclosure"');
    expect(html).not.toContain('data-testid="add-ingredient-context-summary"');
    expect(html).not.toContain("Количество *");
    expect(html).not.toContain("Ед. изм. *");
  });

  it("keeps custom flow focused on ingredient parameters and required stock fields by default", () => {
    const html = renderToStaticMarkup(React.createElement(CustomIngredientForm, {
      category: "fermentable",
      preferredCurrency: "USD",
      pending: false,
      onSubmit: async () => undefined
    }));

    expect(html).toContain("Параметры ингредиента");
    expect(html).toContain("Количество и единица учета");
    expect(html).toContain('data-testid="custom-required-fields"');
    expect(html).toContain('data-testid="custom-optional-disclosure"');
    expect(html).toContain("Добавить цену, ссылки, даты или заметку");
    expect(html).toContain("Необязательно");
    expect(html).toContain("Тип ферментируемого");
    expect(html).toContain("Цвет, EBC");
    expect(html).toContain("Экстрактивность, %");
    expect(html).not.toContain("Базовая ед. изм.");
    expect(html).not.toContain(`value="${getTodayDateInputValue()}"`);
    expect(html).not.toContain('aria-label="Очистить дату покупки"');
    expect(html).not.toContain("За всё");
    expect(html).not.toContain("За единицу");
    expect(html).toContain('step="0.1"');
  });

  it("hides duplicate subtype selector for hop custom flow", () => {
    const html = renderToStaticMarkup(React.createElement(CustomIngredientForm, {
      category: "hop",
      preferredCurrency: "USD",
      pending: false,
      onSubmit: async () => undefined
    }));

    expect(html).toContain("Альфа-кислота, %");
    expect(html).toContain("Год урожая");
    expect(html).not.toContain("Подтип");
    expect(html).not.toContain("Без уточнения");
  });

  it("shows existing custom ingredients browser before the create form in the custom tab", () => {
    const html = renderToStaticMarkup(React.createElement(CustomIngredientPanel, {
      category: "hop",
      preferredCurrency: "USD",
      pending: false,
      onSubmitCreate: async () => undefined,
      onSubmitExisting: async () => undefined
    }));

    expect(html).toContain('data-testid="custom-ingredient-browser"');
    expect(html).toContain("Поиск среди своих ингредиентов");
    expect(html).toContain('data-testid="custom-ingredient-browser-sort"');
    expect(html).toContain("Добавить новый");
    expect(html).toContain("В этой категории пока нет своих ингредиентов.");
  });

  it("keeps optional catalog details hidden until the user reaches them", () => {
    const html = renderToStaticMarkup(React.createElement(AddIngredientModal, { open: true, onClose: () => undefined }));
    expect(html).not.toContain(`value="${getTodayDateInputValue()}"`);
    expect(html).not.toContain('aria-label="Очистить дату покупки"');
    expect(html).not.toContain("Дополнительные данные (необязательно)");
  });

  it("starts add-flow optional fields without a misleading default purchase date", () => {
    expect(createInitialInventoryOptionalFields()).toMatchObject({
      purchasedAt: "",
      freshnessDate: "",
      priceInputAmount: "",
      notes: "",
      purchaseLinksCount: 0
    });
  });

  it("renders add flow in selected state with compact context and without selection chrome", () => {
    const html = renderToStaticMarkup(React.createElement(AddIngredientModal, {
      open: true,
      onClose: () => undefined,
      initialCategory: "fermentable",
      initialSubtype: "malt",
      initialSelection: {
        id: "malt-1",
        type: "fermentable",
        category: "fermentable",
        subtype: "malt",
        displayName: "Пилснер",
        primaryLabelRu: "Пилснер",
        secondaryLabelRu: "Pilsner Malt",
        brand: "Castle Malting",
        countryCode: "BE",
        countryName: "Бельгия",
        defaultUnit: "kg",
        source: "catalog",
        technicalData: {
          type: "malt",
          colorLovibond: 1.4,
          extractPctDryBasis: 81,
          maxUsagePct: null,
          minUsagePct: null,
          proteinPct: null,
          coarseFineDiffPct: null,
          moisturePct: null,
          diastaticPowerLintner: null,
          grainType: null,
          maltStyle: null
        }
      },
      preferredCurrency: "USD"
    }));

    expect(html).not.toContain('data-testid="add-ingredient-category-grid"');
    expect(html).not.toContain('data-testid="add-ingredient-mode-switch"');
    expect(html).toContain('data-testid="add-ingredient-context-summary"');
    expect(html).toContain("Солод · Из каталога");
    expect(html).toContain("Выбрано");
    expect(html).toContain("Пилснер");
    expect(html).toContain("Castle Malting");
    expect(html).not.toContain("Бельгия");
    expect(html).toContain("Изменить выбор");
    expect(html).not.toContain('data-testid="catalog-picker-stage"');
    expect(html).not.toContain('data-testid="ingredient-picker-quick-start"');
    expect(html).not.toContain("Начните вводить название ингредиента");
    expect(html).toContain('data-testid="catalog-required-fields"');
    expect(html).toContain("Количество *");
    expect(html).toContain("Ед. изм. *");
    expect(html).toContain('data-testid="catalog-batch-overrides"');
    expect(html).toContain("Цвет");
    expect(html).toContain("2.76 EBC");
    expect(html).toContain("Экстрактивность");
    expect(html).toContain("81%");
    expect(html).toContain("Уточнить параметры");
    expect(html).toContain('data-testid="catalog-optional-disclosure"');
    expect(html).toContain("Добавить цену, ссылки, даты или заметку");
    expect(html).toContain("Необязательно");
    expect(html).not.toContain("Дополнительно");
  });

  it("shows picker when category is selected but no ingredient is selected", () => {
    const html = renderToStaticMarkup(React.createElement(AddIngredientModal, {
      open: true,
      onClose: () => undefined,
      initialCategory: "hop"
    }));

    expect(html).toContain('data-testid="add-ingredient-category-grid"');
    expect(html).toContain('data-testid="add-ingredient-mode-switch"');
    expect(html).toContain('data-testid="catalog-picker-stage"');
    expect(html).toContain("Начните вводить название ингредиента");
    expect(html).not.toContain('data-testid="ingredient-picker-quick-start"');
    expect(html).not.toContain('data-testid="catalog-selection-stage"');
    expect(html).not.toContain("Изменить выбор");
  });

  it("uses the passed fermentable subtype context in the catalog form", () => {
    const html = renderToStaticMarkup(React.createElement(CatalogIngredientForm, {
      category: "fermentable",
      subtype: "malt",
      preferredCurrency: "USD",
      pending: false,
      onSubmit: async () => undefined,
      onRequestCustom: () => undefined
    }));

    expect(html).toContain('data-testid="catalog-picker-stage"');
    expect(html).toContain("Начните вводить название ингредиента");
    expect(html).toContain('data-testid="ingredient-picker-quick-start"');
    expect(html).toContain("Подобрать солод");
    expect(html).toContain("По типу");
    expect(html).toContain("Избранные");
  });

  it("prefers remembered category for a fresh add context and falls back to malt", () => {
    expect(resolveAddIngredientStartCategoryValue({
      rememberedCategoryValue: "hop"
    })).toBe("hop");

    expect(resolveAddIngredientStartCategoryValue({})).toBe("malt");

    expect(resolveAddIngredientStartCategoryValue({
      initialCategory: "fermentable",
      initialSubtype: "malt",
      rememberedCategoryValue: "hop"
    })).toBe("malt");
  });

  it("keeps typed picker text across category switches until an ingredient is selected", () => {
    expect(resolveCatalogPickerContextChange({
      currentPickerValue: "ПИЛС",
      currentSelected: null,
      nextSelection: null
    })).toEqual({
      pickerValue: "ПИЛС",
      shouldRefocus: true
    });

    expect(resolveCatalogPickerContextChange({
      currentPickerValue: "Пилснер",
      currentSelected: {
        id: "malt-1",
        type: "fermentable",
        category: "fermentable",
        subtype: "malt",
        displayName: "Пилснер",
        primaryLabelRu: "Пилснер",
        defaultUnit: "kg",
        source: "catalog"
      },
      nextSelection: null
    })).toEqual({
      pickerValue: "",
      shouldRefocus: false
    });
  });

  it("returns to picker stage when the user changes the selected ingredient", () => {
    expect(resolveCatalogSelectionResetState({ hidePicker: false })).toEqual({
      pickerValue: "",
      shouldRefocus: true
    });

    expect(shouldShowCatalogPickerStage({
      category: "hop",
      hidePicker: false,
      selected: null
    })).toBe(true);

    expect(shouldShowCatalogRequiredInventoryBlock(null)).toBe(false);
    expect(shouldShowCatalogOptionalSection(null)).toBe(false);
  });

  it("starts deep-linked selection in selected state with the picker hidden", () => {
    expect(shouldShowCatalogPickerStage({
      category: "fermentable",
      hidePicker: false,
      selected: {
        id: "malt-1",
        type: "fermentable",
        category: "fermentable",
        subtype: "malt",
        displayName: "Пилснер",
        primaryLabelRu: "Пилснер",
        defaultUnit: "kg",
        source: "catalog"
      }
    })).toBe(false);
  });

  it("shows override summary with current values first and catalog values as muted reference", () => {
    expect(resolveCatalogBatchOverrideSummaryState({
      defaults: {
        kind: "fermentable",
        fermentableColorEbc: "3.5",
        fermentableExtractYieldPct: "81",
        colorEbc: 3.5,
        extractYieldPct: 81
      },
      overrides: {
        fermentableColorEbc: "4.2",
        fermentableExtractYieldPct: "79",
        hopAlphaAcidPct: ""
      },
      hasTechnicalOverrides: true
    })).toEqual({
      currentEntries: [
        { label: "Цвет", value: "4.2 EBC" },
        { label: "Экстрактивность", value: "79%" }
      ],
      catalogEntries: [
        { label: "Цвет", value: "3.5 EBC" },
        { label: "Экстрактивность", value: "81%" }
      ],
      statusBadgeLabel: "ИЗМЕНЕННЫЙ"
    });

    expect(resolveCatalogBatchOverrideSummaryState({
      defaults: {
        kind: "hop",
        hopAlphaAcidPct: "5.5",
        alphaAcidPct: 5.5
      },
      overrides: {
        fermentableColorEbc: "",
        fermentableExtractYieldPct: "",
        hopAlphaAcidPct: "6.1"
      },
      hasTechnicalOverrides: true
    })).toEqual({
      currentEntries: [
        { label: "Альфа-кислота", value: "6.1% AA" }
      ],
      catalogEntries: [
        { label: "Альфа-кислота", value: "5.5% AA" }
      ],
      statusBadgeLabel: "ИЗМЕНЕННЫЙ"
    });
  });

  it("renders a compact optional disclosure summary when values are already filled", () => {
    expect(resolveInventoryOptionalDisclosureSummary({
      priceInputMode: "total",
      priceInputAmount: "1250",
      purchasedAt: "2026-04-04",
      freshnessDate: "2026-12-01",
      notes: "Холодное хранение",
      purchaseLinksCount: 0
    }, "USD")).toEqual([
      "Цена: 1250 USD",
      "Покупка: 04.04.2026",
      "Годен до: 01.12.2026",
      "Есть заметка"
    ]);

    const html = renderToStaticMarkup(React.createElement(InventoryOptionalDisclosure, {
      open: false,
      onToggle: () => undefined,
      preferredCurrency: "USD",
      fields: {
        priceInputMode: "total",
        priceInputAmount: "1250",
        purchasedAt: "2026-04-04",
        freshnessDate: "2026-12-01",
        notes: "Холодное хранение",
        purchaseLinksCount: 0
      }
    }, React.createElement("div", null, "body")));

    expect(html).toContain("Добавить цену, ссылки, даты или заметку");
    expect(html).toContain("Цена: 1250 USD");
    expect(html).toContain("Покупка: 04.04.2026");
    expect(html).toContain("Годен до: 01.12.2026");
    expect(html).toContain("Есть заметка");
  });

  it("shows derived custom indication and a contextual submit label only for real catalog overrides", () => {
    expect(resolveCatalogDerivedVariantPresentation({
      selected: {
        id: "cat-hop-1",
        type: "hop",
        category: "hop",
        displayName: "Citra",
        primaryLabelRu: "Citra",
        defaultUnit: "g",
        source: "catalog"
      },
      hasTechnicalOverrides: false
    })).toEqual({
      isDerivedVariantFlow: false,
      submitLabel: "Добавить в запасы",
      noticeText: null,
      inlineHelper: null
    });

    expect(resolveCatalogDerivedVariantPresentation({
      selected: {
        id: "cat-hop-1",
        type: "hop",
        category: "hop",
        displayName: "Citra",
        primaryLabelRu: "Citra",
        defaultUnit: "g",
        source: "catalog"
      },
      hasTechnicalOverrides: true
    })).toEqual({
      isDerivedVariantFlow: true,
      submitLabel: "Добавить как свой вариант",
      noticeText: "Сохранится как ваш измененный вариант ингредиента.",
      inlineHelper: "Каталог не изменится."
    });
  });

  it("closes the modal only when the pointer sequence both starts and ends on the backdrop", () => {
    expect(shouldCloseAddIngredientModalFromBackdropInteraction({
      pointerDownStartedOnBackdrop: true,
      clickFinishedOnBackdrop: true
    })).toBe(true);

    expect(shouldCloseAddIngredientModalFromBackdropInteraction({
      pointerDownStartedOnBackdrop: false,
      clickFinishedOnBackdrop: true
    })).toBe(false);

    expect(shouldCloseAddIngredientModalFromBackdropInteraction({
      pointerDownStartedOnBackdrop: true,
      clickFinishedOnBackdrop: false
    })).toBe(false);
  });

  it("commits segmented/category control actions on pointerdown and leaves click for keyboard activation", () => {
    const preventDefault = vi.fn();
    const action = vi.fn();

    applyAddIngredientImmediateControlAction({
      event: { preventDefault },
      action
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledTimes(1);
    expect(shouldApplyAddIngredientControlActionOnClick({ detail: 1 })).toBe(false);
    expect(shouldApplyAddIngredientControlActionOnClick({ detail: 0 })).toBe(true);
  });

  it("closes modal and refreshes route after successful add", () => {
    const onClose = vi.fn();
    const refresh = vi.fn();

    applyAddIngredientSuccessEffects(
      { ok: true, message: "ok" },
      { onClose, refresh }
    );

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not close modal or refresh route on failed add", () => {
    const onClose = vi.fn();
    const refresh = vi.fn();

    applyAddIngredientSuccessEffects(
      { ok: false, message: "validation" },
      { onClose, refresh }
    );

    expect(onClose).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("renders category selector options", () => {
    const html = renderToStaticMarkup(React.createElement(IngredientCategorySelector, { value: "hop", onChange: () => undefined }));
    expect(html).toContain("Хмель");
    expect(html).toContain("Дрожжи");
    expect(html).toContain('value="hop"');
  });

  it("renders all-category option in reusable selector when requested", () => {
    const html = renderToStaticMarkup(React.createElement(IngredientCategorySelector, {
      value: "all",
      onChange: () => undefined,
      includeAll: true
    }));

    expect(html).toContain(">Все<");
    expect(html).toContain('value="all"');
  });

  it("adds catalog ingredient and revalidates inventory page", async () => {
    const formData = new FormData();
    formData.set("ingredientCatalogItemId", "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0");
    formData.set("enteredQuantity", "120");
    formData.set("enteredUnit", "g");
    formData.set("priceInputAmount", "1250");
    formData.set("priceInputMode", "total");

    const result = await addCatalogIngredientAction(null, formData);

    expect(result.ok).toBe(true);
    expect(mockState.addCatalogCalls).toHaveLength(1);
    expect(mockState.addCatalogCalls[0]).toMatchObject({
      ingredientCatalogItemId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
      enteredQuantity: 120,
      enteredUnit: "g",
      priceInputMode: "total",
      priceInputAmountMinor: 125000,
      priceInputCurrency: "USD"
    });
    expect(mockState.revalidated).toContain("/app/ingredients");
  });

  it("stores purchase links on the catalog ingredient reference without polluting the inventory payload", async () => {
    const formData = new FormData();
    formData.set("ingredientCatalogItemId", "catalog-hop-1");
    formData.set("enteredQuantity", "100");
    formData.set("enteredUnit", "g");
    formData.set("purchaseLinksTouched", "true");
    formData.append("purchaseLinks", "ozon.ru/product/citra");
    formData.append("purchaseLinks", "https://market.yandex.ru/product--citra");

    const result = await addCatalogIngredientAction(null, formData);

    expect(result.ok).toBe(true);
    expect(mockState.addCatalogCalls[0]).toMatchObject({
      ingredientCatalogItemId: "catalog-hop-1",
      enteredQuantity: 100,
      enteredUnit: "g"
    });
    expect(mockState.addCatalogCalls[0]).not.toHaveProperty("purchaseLinks");
    expect(mockState.replacePurchaseLinkCalls).toEqual([
      {
        reference: {
          source: "catalog",
          id: "catalog-hop-1"
        },
        urls: [
          "https://ozon.ru/product/citra",
          "https://market.yandex.ru/product--citra"
        ]
      }
    ]);
  });

  it("passes per-unit price mode through the add flow", async () => {
    const formData = new FormData();
    formData.set("ingredientCatalogItemId", "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0");
    formData.set("enteredQuantity", "5");
    formData.set("enteredUnit", "kg");
    formData.set("priceInputAmount", "120");
    formData.set("priceInputMode", "per_display_unit");

    const result = await addCatalogIngredientAction(null, formData);

    expect(result.ok).toBe(true);
    expect(mockState.addCatalogCalls[0]).toMatchObject({
      enteredQuantity: 5,
      enteredUnit: "kg",
      priceInputMode: "per_display_unit",
      priceInputAmountMinor: 12000,
      priceInputCurrency: "USD"
    });
  });

  it("adds custom ingredient and then adds it to inventory", async () => {
    const formData = new FormData();
    formData.set("category", "yeast");
    formData.set("displayName", "US-05");
    formData.set("brand", "Fermentis");
    formData.set("yeastForm", "dry");
    formData.set("yeastAttenuationPct", "78");
    formData.set("defaultDisplayUnit", "pack");
    formData.set("enteredQuantity", "1");
    formData.set("enteredUnit", "pack");

    const result = await addCustomIngredientAction(null, formData);

    expect(result.ok).toBe(true);
    expect(mockState.createCustomCalls).toHaveLength(1);
    expect(mockState.createCustomCalls[0]).toMatchObject({
      category: "yeast",
      brand: "Fermentis",
      yeastForm: "dry",
      yeastAttenuationPct: 78,
      defaultDisplayUnit: "pack"
    });
    expect(mockState.addCustomCalls[0]?.userCustomIngredientId).toBe("3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0");
    expect(mockState.addCustomCalls[0]).toMatchObject({
      enteredQuantity: 1,
      enteredUnit: "pack"
    });
    expect(mockState.revalidated).toContain("/app/ingredients");
  });

  it("stores purchase links on the created custom ingredient reference", async () => {
    const formData = new FormData();
    formData.set("category", "hop");
    formData.set("displayName", "Citra");
    formData.set("brand", "Yakima Chief");
    formData.set("hopAlphaAcidPct", "12.5");
    formData.set("defaultDisplayUnit", "g");
    formData.set("enteredQuantity", "100");
    formData.set("enteredUnit", "g");
    formData.set("purchaseLinksTouched", "true");
    formData.append("purchaseLinks", "https://www.wildberries.ru/catalog/123/detail.aspx");
    formData.append("purchaseLinks", "xn--90aoy.xn--p1ai/citra");

    const result = await addCustomIngredientAction(null, formData);

    expect(result.ok).toBe(true);
    expect(mockState.createCustomCalls).toHaveLength(1);
    expect(mockState.addCustomCalls).toHaveLength(1);
    expect(mockState.replacePurchaseLinkCalls).toEqual([
      {
        reference: {
          source: "custom",
          id: mockState.createdCustomId
        },
        urls: [
          "https://www.wildberries.ru/catalog/123/detail.aspx",
          "https://xn--90aoy.xn--p1ai/citra"
        ]
      }
    ]);
  });

  it("adds an existing custom ingredient from the picker through the custom inventory path", async () => {
    const formData = new FormData();
    formData.set("userCustomIngredientId", mockState.createdCustomId);
    formData.set("enteredQuantity", "2");
    formData.set("enteredUnit", "pack");

    const result = await addSelectedIngredientAction(null, formData);

    expect(result.ok).toBe(true);
    expect(mockState.addCatalogCalls).toHaveLength(0);
    expect(mockState.addCustomCalls).toHaveLength(1);
    expect(mockState.addCustomCalls[0]).toMatchObject({
      userCustomIngredientId: mockState.createdCustomId,
      enteredQuantity: 2,
      enteredUnit: "pack"
    });
  });

  it("routes catalog fermentable overrides through a derived custom ingredient source", async () => {
    mockState.resolveCatalogSourceMode = "custom";

    const formData = new FormData();
    formData.set("ingredientCatalogItemId", "catalog-malt-1");
    formData.set("enteredQuantity", "5");
    formData.set("enteredUnit", "kg");
    formData.set("fermentableColorEbc", "6.5");
    formData.set("fermentableExtractYieldPct", "82");

    const result = await addSelectedIngredientAction(null, formData);

    expect(result.ok).toBe(true);
    expect(result.message).toBe("Свой вариант ингредиента добавлен в запасы.");
    expect(mockState.resolveCatalogSourceCalls).toHaveLength(1);
    expect(mockState.resolveCatalogSourceCalls[0]).toMatchObject({
      ingredientCatalogItemId: "catalog-malt-1",
      fermentableColorEbc: "6.5",
      fermentableExtractYieldPct: "82"
    });
    expect(mockState.addCatalogCalls).toHaveLength(0);
    expect(mockState.addCustomCalls).toHaveLength(1);
    expect(mockState.addCustomCalls[0]).toMatchObject({
      userCustomIngredientId: mockState.createdCustomId,
      enteredQuantity: 5,
      enteredUnit: "kg"
    });
  });

  it("routes catalog hop overrides through the derived custom source resolver", async () => {
    mockState.resolveCatalogSourceMode = "custom";

    const formData = new FormData();
    formData.set("ingredientCatalogItemId", "catalog-hop-1");
    formData.set("enteredQuantity", "250");
    formData.set("enteredUnit", "g");
    formData.set("hopAlphaAcidPct", "13.2");

    const result = await addSelectedIngredientAction(null, formData);

    expect(result.ok).toBe(true);
    expect(mockState.resolveCatalogSourceCalls[0]).toMatchObject({
      ingredientCatalogItemId: "catalog-hop-1",
      hopAlphaAcidPct: "13.2"
    });
    expect(mockState.addCatalogCalls).toHaveLength(0);
    expect(mockState.addCustomCalls).toHaveLength(1);
  });

  it("updates inventory item purchase links through the selected ingredient reference and keeps the main edit payload intact", async () => {
    const result = await updateInventoryItemAction({
      inventoryItemId: "inv-1",
      ingredientCatalogItemId: "catalog-malt-1",
      enteredQuantity: "5",
      enteredUnit: "kg",
      notes: "Обновлено",
      purchaseLinksTouched: true,
      purchaseLinks: [
        "rdshop.ru/catalog/pilsner",
        "https://kolba.ru/catalog/pilsner"
      ]
    });

    expect(result.ok).toBe(true);
    expect(mockState.updateItemCalls).toEqual([
      {
        inventoryItemId: "inv-1",
        payload: expect.objectContaining({
          ingredientCatalogItemId: "catalog-malt-1",
          enteredQuantity: 5,
          enteredUnit: "kg",
          notes: "Обновлено"
        })
      }
    ]);
    expect(mockState.replacePurchaseLinkCalls).toEqual([
      {
        reference: {
          source: "catalog",
          id: "catalog-malt-1"
        },
        urls: [
          "https://rdshop.ru/catalog/pilsner",
          "https://kolba.ru/catalog/pilsner"
        ]
      }
    ]);
  });

  it("falls back to the existing catalog add path when override values do not require a clone", async () => {
    mockState.resolveCatalogSourceMode = "catalog";

    const formData = new FormData();
    formData.set("ingredientCatalogItemId", "catalog-hop-1");
    formData.set("enteredQuantity", "250");
    formData.set("enteredUnit", "g");
    formData.set("hopAlphaAcidPct", "12");

    const result = await addSelectedIngredientAction(null, formData);

    expect(result.ok).toBe(true);
    expect(result.message).toBe("Ингредиент добавлен в запасы.");
    expect(mockState.resolveCatalogSourceCalls).toHaveLength(1);
    expect(mockState.addCatalogCalls).toHaveLength(1);
    expect(mockState.addCustomCalls).toHaveLength(0);
  });

  it("rejects invalid payload", async () => {
    const formData = new FormData();
    formData.set("ingredientCatalogItemId", "catalog-item");
    formData.set("enteredQuantity", "0");
    formData.set("enteredUnit", "");

    const result = await addCatalogIngredientAction(null, formData);

    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.enteredQuantity).toBeDefined();
  });

  it("builds picker search params with category filter", () => {
    const params = buildIngredientSearchParams({ q: "citra", category: "hop", limit: 8 });

    expect(params.get("q")).toBe("citra");
    expect(params.get("category")).toBe("hop");
    expect(params.get("limit")).toBe("8");
  });

  it("builds picker search params without category for cross-category search", () => {
    const params = buildIngredientSearchParams({ q: "saaz", limit: 8 });

    expect(params.get("q")).toBe("saaz");
    expect(params.has("category")).toBe(false);
    expect(params.get("limit")).toBe("8");
  });

  it("exposes subtype options for custom category flow", () => {
    expect(getCustomIngredientSubtypeOptions("water_treatment")).toContain("acid");
    expect(getCustomIngredientSubtypeOptions("consumable")).toContain("fining");
  });

  it("submits selected catalog entity instead of free text", () => {
    const payload = buildCatalogIngredientPayload(
      {
        id: "cat-1",
        type: "hop",
        displayName: "Citra",
        defaultUnit: "g",
        source: "catalog"
      },
      {
        enteredQuantity: "100",
        enteredUnit: "g",
        priceInputMode: "total",
        priceInputAmount: "",
        purchasedAt: "",
        freshnessDate: "",
        notes: "",
        purchaseLinksCount: 0
      }
    );

    expect(payload.ingredientCatalogItemId).toBe("cat-1");
    expect(() => buildCatalogIngredientPayload(null, {
      enteredQuantity: "100",
      enteredUnit: "g",
      priceInputMode: "total",
      priceInputAmount: "",
      purchasedAt: "",
      freshnessDate: "",
      notes: "",
      purchaseLinksCount: 0
    })).toThrowError("CATALOG_SELECTION_REQUIRED");
  });

  it("keeps optional catalog payload secondary and only includes it on demand", () => {
    const payload = buildCatalogIngredientPayload(
      {
        id: "cat-hop-1",
        type: "hop",
        category: "hop",
        displayName: "Citra",
        defaultUnit: "g",
        source: "catalog"
      },
      {
        enteredQuantity: "100",
        enteredUnit: "g",
        priceInputMode: "total",
        priceInputAmount: "1250",
        purchasedAt: getTodayDateInputValue(),
        freshnessDate: "2026-12-01",
        notes: "Холодное хранение",
        purchaseLinksCount: 0
      },
      {
        includeOptionalDetails: false,
        batchOverrides: {
          hopAlphaAcidPct: "12.8"
        }
      }
    );

    expect(payload).toMatchObject({
      ingredientCatalogItemId: "cat-hop-1",
      enteredQuantity: "100",
      enteredUnit: "g",
      hopAlphaAcidPct: "12.8"
    });
    expect(payload.priceInputMode).toBeUndefined();
    expect(payload.purchasedAt).toBeUndefined();
  });

  it("resolves fermentable override defaults and detects when values differ from the catalog", () => {
    const selected = {
      id: "malt-1",
      type: "malt" as const,
      category: "fermentable" as const,
      subtype: "malt" as const,
      displayName: "Пилснер",
      defaultUnit: "kg" as const,
      source: "catalog" as const,
      technicalData: {
        type: "malt" as const,
        colorEbcMin: 5,
        colorEbcMax: 5,
        colorLovibond: 2.54,
        extractPctDryBasis: 81,
        proteinPct: null,
        maxUsagePct: null,
        maltType: "base" as const
      }
    };

    expect(resolveCatalogBatchOverrideDefaults(selected)).toMatchObject({
      kind: "fermentable",
      fermentableColorEbc: "5",
      fermentableExtractYieldPct: "81"
    });
    expect(hasCatalogIngredientTechnicalOverrides({
      selected,
      overrides: {
        fermentableColorEbc: "5",
        fermentableExtractYieldPct: "81",
        hopAlphaAcidPct: ""
      }
    })).toBe(false);
    expect(hasCatalogIngredientTechnicalOverrides({
      selected,
      overrides: {
        fermentableColorEbc: "6.5",
        fermentableExtractYieldPct: "82",
        hopAlphaAcidPct: ""
      }
    })).toBe(true);
  });

  it("does not mark rounded catalog fermentable values as changed", () => {
    const selected = {
      id: "malt-2",
      type: "malt" as const,
      category: "fermentable" as const,
      subtype: "malt" as const,
      displayName: "Пилснер Премиум",
      defaultUnit: "kg" as const,
      source: "catalog" as const,
      technicalData: {
        type: "malt" as const,
        colorEbcMin: 3.7065,
        colorEbcMax: 3.7065,
        colorLovibond: null,
        extractPctDryBasis: 83,
        proteinPct: null,
        maxUsagePct: null,
        maltType: "base" as const
      }
    };

    expect(resolveCatalogBatchOverrideDefaults(selected)).toMatchObject({
      kind: "fermentable",
      fermentableColorEbc: "3.71",
      fermentableExtractYieldPct: "83"
    });
    expect(hasCatalogIngredientTechnicalOverrides({
      selected,
      overrides: {
        fermentableColorEbc: "3.71",
        fermentableExtractYieldPct: "83",
        hopAlphaAcidPct: ""
      }
    })).toBe(false);
  });

  it("uses the average catalog fermentable color when a range is provided", () => {
    const selected = {
      id: "malt-range-1",
      type: "malt" as const,
      category: "fermentable" as const,
      subtype: "malt" as const,
      displayName: "Vienna Malt",
      defaultUnit: "kg" as const,
      source: "catalog" as const,
      technicalData: {
        type: "malt" as const,
        colorEbcMin: 4,
        colorEbcMax: 8,
        colorLovibond: null,
        extractPctDryBasis: 80,
        proteinPct: null,
        maxUsagePct: null,
        maltType: "base" as const
      }
    };

    expect(resolveCatalogBatchOverrideDefaults(selected)).toMatchObject({
      kind: "fermentable",
      fermentableColorEbc: "6",
      fermentableExtractYieldPct: "80"
    });
    expect(hasCatalogIngredientTechnicalOverrides({
      selected,
      overrides: {
        fermentableColorEbc: "6",
        fermentableExtractYieldPct: "80",
        hopAlphaAcidPct: ""
      }
    })).toBe(false);
  });

  it("defaults dry yeast catalog additions to pack units", () => {
    const profile = resolveCatalogIngredientUnitProfile("yeast", {
      id: "yeast-1",
      type: "yeast",
      category: "yeast",
      displayName: "US-05",
      defaultUnit: "g",
      technicalData: {
        type: "yeast",
        form: "dry",
        attenuationPctTypical: 78,
        fermentationTempCMin: null,
        fermentationTempCMax: null,
        flocculation: null,
        alcoholToleranceAbvTypical: null,
        packageSize: null,
        packageUnit: null
      },
      source: "catalog"
    });

    expect(profile.defaultUnit).toBe("pack");
    expect(profile.allowedUnits).toEqual(["pack", "g"]);
  });
});
