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
  createUserCustomInventoryIngredient: async (_userId: string, payload: unknown) => {
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
  AddIngredientModalBody,
  applyAddIngredientImmediateControlAction,
  applyAddIngredientSuccessEffects,
  resolveAddIngredientStartCategoryValue,
  resolveAddIngredientStartContext,
  shouldApplyAddIngredientControlActionOnClick
} from "../components/inventory/add-ingredient-modal";
import { AddIngredientTrigger } from "../components/inventory/add-ingredient-trigger";
import {
  buildCatalogIngredientPayload,
  CatalogIngredientForm,
  hasCatalogIngredientTechnicalOverrides,
  isCatalogIngredientFormDirty,
  resolveCatalogDerivedVariantPresentation,
  resolveCatalogBatchOverrideSummaryState,
  resolveCatalogPickerContextChange,
  resolveCatalogSelectionResetState,
  resolveCatalogBatchOverrideDefaults,
  resolveCatalogIngredientUnitProfile,
  resolveVisibleConsumableCatalogGroupSwitchValues,
  shouldShowCatalogOptionalSection,
  shouldShowCatalogPickerStage,
  shouldShowCatalogRequiredInventoryBlock
} from "../components/inventory/catalog-ingredient-form";
import { CustomIngredientPanel } from "../components/inventory/custom-ingredient-panel";
import {
  CustomIngredientForm,
  getCustomIngredientSubtypeOptions,
  isCustomIngredientFormDirty,
  resolveCustomIngredientAmountPrefillDecision
} from "../components/inventory/custom-ingredient-form";
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
    // AddIngredientModal оборачивает это содержимое в @nb/ui Dialog (Radix Portal
    // рендерится только на клиенте после монтирования), поэтому проверяем внутренний
    // AddIngredientModalBody напрямую.
    const html = renderToStaticMarkup(React.createElement(AddIngredientModalBody, {
      onClose: () => undefined
    }));

    expect(html).toContain('data-testid="add-ingredient-category-grid"');
    expect(html).toContain('data-testid="add-ingredient-mode-switch"');
    expect(html).toContain("Добавить свой");
    expect(html).toContain("Начните вводить название ингредиента");
    expect(html).not.toContain('data-testid="catalog-required-fields"');
    expect(html).not.toContain('data-testid="catalog-batch-overrides"');
    expect(html).not.toContain('data-testid="catalog-optional-disclosure"');
    expect(html).not.toContain('data-testid="add-ingredient-context-summary"');
    expect(html).not.toContain("Количество *");
    expect(html).not.toContain("Ед. изм. *");
  });

  // П3: строка-нехватка без каталожной/кастомной привязки (живёт только именем
  // из снапшота) открывает модалку сразу в режиме «Добавить свой» с
  // предзаполненным именем/количеством — без этого пользователю не из чего
  // выбирать (позиции ещё не существует).
  it("П3: initialDisplayName starts the modal directly on the custom tab, prefilled", () => {
    // initialQuantity/initialUnit подставляются эффектом (как и у CatalogIngredientForm)
    // и не наблюдаемы в SSR-рендере без монтирования — здесь проверяем то, что
    // рендерится синхронно: стартовую вкладку и предзаполненное имя.
    const html = renderToStaticMarkup(React.createElement(AddIngredientModalBody, {
      onClose: () => undefined,
      initialCategory: "consumable",
      initialDisplayName: "Кориандр молотый",
      initialQuantity: "10",
      initialUnit: "g"
    }));

    expect(html).toContain('data-testid="custom-ingredient-create-panel"');
    expect(html).not.toContain('data-testid="catalog-picker-stage"');
    expect(html).toContain('value="Кориандр молотый"');
  });

  it("keeps custom flow focused on ingredient parameters and required stock fields by default", () => {
    const html = renderToStaticMarkup(React.createElement(CustomIngredientForm, {
      category: "fermentable",
      initialSubtype: "malt",
      preferredCurrency: "USD",
      pending: false,
      onSubmit: async () => undefined
    }));

    expect(html).toContain("Параметры ингредиента");
    expect(html).toContain("Количество и единица учета");
    expect(html).toContain('data-testid="custom-required-fields"');
    expect(html).toContain('data-testid="custom-optional-disclosure"');
    expect(html).toContain("Цена, даты и заметки");
    expect(html).toContain("Необязательно");
    expect((html.match(/>обязательно</g) ?? [])).toHaveLength(2);
    expect(html).not.toContain("Минимум для создания");
    expect(html).not.toContain("Короткое понятное имя");
    expect(html).not.toContain("Стартовый остаток");
    expect(html).not.toContain("Тип ферментируемого");
    expect(html).toContain("Цвет, EBC");
    expect(html).toContain("Экстрактивность, %");
    expect(html).toContain("Страна");
    expect(html).toContain("Выберите страну");
    expect(html).toContain("placeholder=\"Например: Пшеничный солод\"");
    expect(html).toContain("placeholder=\"Например: Castle Malting\"");
    expect(html).toContain("placeholder=\"Например: 3.5\"");
    expect(html).toContain("placeholder=\"Например: 81\"");
    expect(html).not.toContain("Базовая ед. изм.");
    expect(html).not.toContain("Ед. изм. *");
    expect(html).not.toContain(`value="${getTodayDateInputValue()}"`);
    expect(html).not.toContain('aria-label="Очистить дату покупки"');
    expect(html).not.toContain("За всё");
    expect(html).not.toContain("За единицу");
    // Количество — дробное: раньше это выражалось через step="any" у нативного
    // type="number", теперь поле собрано на NumericInput (он же принимает запятую).
    expect(html).toContain('inputMode="decimal"');
  });

  it("uses category-specific placeholders in custom flow outside malt", () => {
    const fermentableHtml = renderToStaticMarkup(React.createElement(CustomIngredientForm, {
      category: "fermentable",
      initialSubtype: "fermentable",
      preferredCurrency: "USD",
      pending: false,
      onSubmit: async () => undefined
    }));
    const hopHtml = renderToStaticMarkup(React.createElement(CustomIngredientForm, {
      category: "hop",
      preferredCurrency: "USD",
      pending: false,
      onSubmit: async () => undefined
    }));
    const yeastHtml = renderToStaticMarkup(React.createElement(CustomIngredientForm, {
      category: "yeast",
      preferredCurrency: "USD",
      pending: false,
      onSubmit: async () => undefined
    }));
    const waterTreatmentHtml = renderToStaticMarkup(React.createElement(CustomIngredientForm, {
      category: "water_treatment",
      preferredCurrency: "USD",
      pending: false,
      onSubmit: async () => undefined
    }));
    const consumableHtml = renderToStaticMarkup(React.createElement(CustomIngredientForm, {
      category: "consumable",
      preferredCurrency: "USD",
      pending: false,
      onSubmit: async () => undefined
    }));

    expect(fermentableHtml).toContain("placeholder=\"Например: Декстроза\"");
    expect(fermentableHtml).toContain("placeholder=\"Например: Briess\"");
    expect(hopHtml).toContain("placeholder=\"Например: Хмель Cascade\"");
    expect(hopHtml).toContain("placeholder=\"Например: Yakima Chief Hops\"");
    expect(yeastHtml).toContain("placeholder=\"Например: US-05\"");
    expect(yeastHtml).toContain("placeholder=\"Например: Fermentis\"");
    expect(waterTreatmentHtml).toContain("placeholder=\"Например: Молочная кислота 80%\"");
    expect(waterTreatmentHtml).toContain("placeholder=\"Например: Неохим\"");
    expect(consumableHtml).toContain("placeholder=\"Например: Irish Moss\"");
    expect(consumableHtml).toContain("placeholder=\"Например: Five Star Chemicals\"");
  });

  it("shows acid concentration in custom water treatment flow", () => {
    const html = renderToStaticMarkup(React.createElement(CustomIngredientForm, {
      category: "water_treatment",
      initialSubtype: "acid",
      preferredCurrency: "USD",
      pending: false,
      onSubmit: async () => undefined
    }));

    expect(html).toContain("Концентрация кислоты, %");
    expect(html).toContain("placeholder=\"Например: 80\"");
  });

  it("hides duplicate subtype selector for hop custom flow", () => {
    const html = renderToStaticMarkup(React.createElement(CustomIngredientForm, {
      category: "hop",
      preferredCurrency: "USD",
      pending: false,
      onSubmit: async () => undefined
    }));

    expect(html).toContain("Тип хмеля");
    expect(html).toContain("Альфа, %");
    expect(html).toContain("Урожай");
    expect(html).toContain("Гранулы");
    expect(html).not.toContain(">Стандарт<");
    expect(html).not.toContain("Подтип");
    expect(html).not.toContain("Без уточнения");
  });

  it("opens the custom tab directly in create mode", () => {
    const html = renderToStaticMarkup(React.createElement(CustomIngredientPanel, {
      category: "hop",
      preferredCurrency: "USD",
      pending: false,
      onSubmitCreate: async () => undefined
    }));

    expect(html).toContain('data-testid="custom-ingredient-create-panel"');
    expect(html).toContain("Параметры ингредиента");
    expect(html).toContain("Количество и единица учета");
  });

  // П3: панель прокидывает предзаполненное имя из deeplink-а в форму создания.
  it("forwards initialDisplayName down to the create form", () => {
    const html = renderToStaticMarkup(React.createElement(CustomIngredientPanel, {
      category: "consumable",
      initialDisplayName: "Кориандр молотый",
      preferredCurrency: "USD",
      pending: false,
      onSubmitCreate: async () => undefined
    }));

    expect(html).toContain('value="Кориандр молотый"');
  });

  it("reuses the same ingredient parameter form for recipe custom flow without stock-only sections", () => {
    const html = renderToStaticMarkup(React.createElement(CustomIngredientForm, {
      category: "fermentable",
      initialSubtype: "malt",
      initialDisplayName: "Vienna Malt",
      pending: false,
      mode: "recipe",
      submitLabel: "Создать свой ингредиент",
      onSubmit: async () => undefined
    }));

    expect(html).toContain("Параметры ингредиента");
    expect(html).toContain("placeholder=\"Например: Пшеничный солод\"");
    expect(html).toContain("placeholder=\"Например: Castle Malting\"");
    expect(html).toContain("Цвет, EBC");
    expect(html).toContain("Экстрактивность, %");
    expect(html).toContain("Страна");
    expect(html).toContain("Создать свой ингредиент");
    expect(html).not.toContain("Количество и единица учета");
    expect(html).not.toContain('data-testid="custom-required-fields"');
    expect(html).not.toContain('data-testid="custom-optional-disclosure"');
    expect(html).not.toContain("Создать и добавить в запасы");
  });

  it("keeps optional catalog details hidden until the user reaches them", () => {
    const html = renderToStaticMarkup(React.createElement(AddIngredientModalBody, { onClose: () => undefined }));
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
    const html = renderToStaticMarkup(React.createElement(AddIngredientModalBody, {
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
    expect(html).toContain("Цена, даты и заметки");
    expect(html).toContain("Необязательно");
    expect(html).not.toContain("Дополнительно");
  });

  it("shows picker when category is selected but no ingredient is selected", () => {
    const html = renderToStaticMarkup(React.createElement(AddIngredientModalBody, {
      onClose: () => undefined,
      initialCategory: "hop"
    }));

    expect(html).toContain('data-testid="add-ingredient-category-grid"');
    expect(html).toContain('data-testid="add-ingredient-mode-switch"');
    expect(html).toContain('data-testid="catalog-picker-stage"');
    expect(html).toContain("Начните вводить название ингредиента");
    expect(html).toContain('data-testid="ingredient-picker-quick-start"');
    expect(html).toContain("Загружаем недавние...");
    expect(html).not.toContain('data-testid="catalog-selection-stage"');
    expect(html).not.toContain("Изменить выбор");
  });

  it("uses the passed fermentable subtype context in the catalog form", () => {
    const html = renderToStaticMarkup(React.createElement(CatalogIngredientForm, {
      category: "fermentable",
      subtype: "malt",
      initialQuickStartAvailability: {
        hasFavoritesAvailable: true,
        hasCustomAvailable: true
      },
      preferredCurrency: "USD",
      pending: false,
      onSubmit: async () => undefined,
      onRequestCustom: () => undefined
    }));

    expect(html).toContain('data-testid="catalog-picker-stage"');
    expect(html).toContain("Начните вводить название ингредиента");
    expect(html).toContain('data-testid="ingredient-picker-quick-start"');
    expect(html).toContain('data-testid="ingredient-picker-quick-start-favorites"');
    expect(html).toContain("Только избранные");
    expect(html).toContain("Только свои");
    expect(html).toContain("По бренду");
    expect(html).toContain("Castle Malting");
    expect(html).toContain("По типу");
    expect(html).toContain("Загружаем недавние...");
  });

  it("shows fermentable quick-start groups in the catalog form for generic fermentables", () => {
    const html = renderToStaticMarkup(React.createElement(CatalogIngredientForm, {
      category: "fermentable",
      subtype: "fermentable",
      preferredCurrency: "USD",
      pending: false,
      onSubmit: async () => undefined,
      onRequestCustom: () => undefined
    }));

    expect(html).toContain('data-testid="ingredient-picker-quick-start"');
    expect(html).toContain("По группе");
    expect(html).not.toContain("По бренду");
    expect(html).not.toContain('data-testid="ingredient-picker-quick-start-types"');
  });

  it("renders fermentable business chips in the catalog picker", () => {
    const html = renderToStaticMarkup(React.createElement(CatalogIngredientForm, {
      category: "fermentable",
      subtype: null,
      preferredCurrency: "USD",
      pending: false,
      onSubmit: async () => undefined,
      onRequestCustom: () => undefined,
      onSubtypeChange: () => undefined,
      onGroupChange: () => undefined
    }));

    expect(html).toContain('data-testid="catalog-fermentable-subtype-switch"');
    expect(html).toContain("Солод");
    expect(html).toContain("Несоложёное сырьё");
    expect(html).toContain("Концентраты");
    expect(html).toContain("Сахара и сиропы");
    expect(html).toContain("Фрукты и соки");
  });

  it("uses the passed hop quick-start context in the catalog form", () => {
    const html = renderToStaticMarkup(React.createElement(CatalogIngredientForm, {
      category: "hop",
      initialQuickStartData: {
        brands: [],
        recent: [],
        hasFavoritesAvailable: true,
        hasCustomAvailable: true
      },
      preferredCurrency: "USD",
      pending: false,
      onSubmit: async () => undefined,
      onRequestCustom: () => undefined
    }));

    expect(html).toContain('data-testid="ingredient-picker-quick-start"');
    expect(html).toContain('data-testid="ingredient-picker-quick-start-favorites"');
    expect(html).toContain("Только избранные");
    expect(html).toContain("Только свои");
    expect(html).not.toContain("По бренду");
    expect(html).not.toContain('data-testid="ingredient-picker-quick-start-types"');
    expect(html).toContain("Загружаем недавние...");
  });

  it("uses the passed yeast quick-start context in the catalog form", () => {
    const html = renderToStaticMarkup(React.createElement(CatalogIngredientForm, {
      category: "yeast",
      initialQuickStartData: {
        brands: [{
          type: "manufacturer",
          label: "Fermentis",
          normalizedLabel: "fermentis",
          value: "Fermentis",
          count: 8,
          score: 80
        }],
        recent: [],
        hasFavoritesAvailable: true,
        hasCustomAvailable: true
      },
      preferredCurrency: "USD",
      pending: false,
      onSubmit: async () => undefined,
      onRequestCustom: () => undefined
    }));

    expect(html).toContain('data-testid="ingredient-picker-quick-start"');
    expect(html).toContain('data-testid="ingredient-picker-quick-start-favorites"');
    expect(html).toContain("Только избранные");
    expect(html).toContain("Только свои");
    expect(html).toContain("По бренду");
    expect(html).toContain("Fermentis");
    expect(html).not.toContain('data-testid="ingredient-picker-quick-start-types"');
    expect(html).toContain("Загружаем недавние...");
  });

  it("uses the passed water treatment quick-start context in the catalog form", () => {
    const html = renderToStaticMarkup(React.createElement(CatalogIngredientForm, {
      category: "water_treatment",
      initialQuickStartData: {
        brands: [],
        groups: [{
          type: "consumable_group",
          label: "Соли",
          normalizedLabel: "salt",
          value: "salt",
          count: 8,
          score: 80
        }, {
          type: "consumable_group",
          label: "Кислоты",
          normalizedLabel: "acid",
          value: "acid",
          count: 0,
          score: 0
        }, {
          type: "consumable_group",
          label: "Щёлочи",
          normalizedLabel: "base",
          value: "base",
          count: 0,
          score: 0
        }, {
          type: "consumable_group",
          label: "Дехлорирование",
          normalizedLabel: "dechlorination",
          value: "dechlorination",
          count: 0,
          score: 0
        }, {
          type: "consumable_group",
          label: "База воды",
          normalizedLabel: "water_source",
          value: "water_source",
          count: 2,
          score: 20
        }],
        recent: [],
        hasFavoritesAvailable: true,
        hasCustomAvailable: true
      },
      preferredCurrency: "USD",
      pending: false,
      onSubmit: async () => undefined,
      onRequestCustom: () => undefined
    }));

    expect(html).toContain('data-testid="ingredient-picker-quick-start"');
    expect(html).toContain('data-testid="ingredient-picker-quick-start-favorites"');
    expect(html).toContain("Только избранные");
    expect(html).toContain("Только свои");
    expect(html).toContain("По группе");
    expect(html).toContain("Соли");
    expect(html).toContain("Кислоты");
    expect(html).toContain("Щёлочи");
    expect(html).toContain("Дехлорирование");
    expect(html).toContain("База воды");
    expect(html).not.toContain("По бренду");
    expect(html).toContain("Загружаем недавние...");
  });

  it("shows catalog acid concentration override for stock additions", () => {
    const html = renderToStaticMarkup(React.createElement(CatalogIngredientForm, {
      category: "water_treatment",
      initialSelection: {
        id: "lactic-acid",
        type: "water_treatment",
        category: "water_treatment",
        subtype: "acid",
        displayName: "Молочная кислота",
        primaryLabelRu: "Молочная кислота",
        defaultUnit: "ml",
        source: "catalog",
        technicalData: {
          type: "water_treatment",
          displayFormula: "88%",
          defaultConcentrationPct: 88,
          unitPreferred: "ml"
        }
      },
      preferredCurrency: "USD",
      pending: false,
      onSubmit: async () => undefined,
      onRequestCustom: () => undefined
    }));

    expect(html).toContain('data-testid="catalog-batch-overrides"');
    expect(html).toContain("Концентрация");
    expect(html).toContain("88%");
    expect(html).toContain("Концентрация кислоты, %");
    expect(html).not.toContain("Уточнить параметры");
  });

  it("uses the passed consumable quick-start context in the catalog form", () => {
    const html = renderToStaticMarkup(React.createElement(CatalogIngredientForm, {
      category: "consumable",
      initialQuickStartData: {
        brands: [],
        groups: [{
          type: "consumable_group",
          label: "Санитайзеры",
          normalizedLabel: "sanitizer",
          value: "sanitizer",
          count: 8,
          score: 80
        }, {
          type: "consumable_group",
          label: "Мойка",
          normalizedLabel: "cleaner",
          value: "cleaner",
          count: 0,
          score: 0
        }, {
          type: "consumable_group",
          label: "Техдобавки",
          normalizedLabel: "technical_additives",
          value: "technical_additives",
          count: 0,
          score: 0
        }, {
          type: "consumable_group",
          label: "Фильтрация затора",
          normalizedLabel: "lauter_aid",
          value: "lauter_aid",
          count: 0,
          score: 0
        }, {
          type: "consumable_group",
          label: "Специи",
          normalizedLabel: "spice",
          value: "spice",
          count: 0,
          score: 0
        }, {
          type: "consumable_group",
          label: "Цедра и цитрус",
          normalizedLabel: "citrus_zest",
          value: "citrus_zest",
          count: 0,
          score: 0
        }, {
          type: "consumable_group",
          label: "Тара и укупорка",
          normalizedLabel: "packaging",
          value: "packaging",
          count: 0,
          score: 0
        }, {
          type: "consumable_group",
          label: "Газы",
          normalizedLabel: "gas",
          value: "gas",
          count: 2,
          score: 20
        }],
        recent: [],
        hasFavoritesAvailable: true,
        hasCustomAvailable: true
      },
      preferredCurrency: "USD",
      pending: false,
      onSubmit: async () => undefined,
      onRequestCustom: () => undefined
    }));

    expect(html).toContain('data-testid="ingredient-picker-quick-start"');
    expect(html).toContain('data-testid="ingredient-picker-quick-start-favorites"');
    expect(html).toContain("Только избранные");
    expect(html).toContain("Только свои");
    expect(html).toContain("По группе");
    expect(html).toContain("Санитайзеры");
    expect(html).toContain("Мойка");
    expect(html).toContain("Техдобавки");
    expect(html).toContain("Фильтрация затора");
    expect(html).toContain("Специи");
    expect(html).toContain("Цедра и цитрус");
    expect(html).toContain("Тара и укупорка");
    expect(html).toContain("Газы");
    expect(html).not.toContain("По бренду");
    expect(html).toContain("Загружаем недавние...");
  });

  it("renders split consumable chips in the catalog picker", () => {
    const html = renderToStaticMarkup(React.createElement(CatalogIngredientForm, {
      category: "consumable",
      forcedGroup: "inventory_supplies",
      preferredCurrency: "USD",
      pending: false,
      onSubmit: async () => undefined,
      onRequestCustom: () => undefined,
      onGroupChange: () => undefined
    }));

    expect(html).toContain('data-testid="catalog-consumable-group-switch"');
    expect(html).toContain("Санитайзеры");
    expect(html).toContain("Мойка");
    expect(html).toContain("Тара и укупорка");
    expect(html).toContain("Газы");
  });

  it("hides the additive fallback chip when there is no real coverage", () => {
    expect(resolveVisibleConsumableCatalogGroupSwitchValues({
      activeConsumableBroadGroup: "inventory_additives",
      initialQuickStartData: {
        brands: [],
        groups: [{
          type: "consumable_group",
          label: "Техдобавки",
          normalizedLabel: "technical_additives",
          value: "technical_additives",
          count: 3,
          score: 30
        }, {
          type: "consumable_group",
          label: "Фильтрация затора",
          normalizedLabel: "lauter_aid",
          value: "lauter_aid",
          count: 12,
          score: 120
        }],
        recent: [],
        hasFavoritesAvailable: false,
        hasCustomAvailable: false
      }
    })).toEqual([
      "technical_additives",
      "lauter_aid",
      "spice",
      "citrus_zest",
      "herb_flower",
      "coffee_cacao",
      "wood_aging",
      "flavoring"
    ]);
  });

  it("keeps the additive fallback chip visible when it is already selected", () => {
    expect(resolveVisibleConsumableCatalogGroupSwitchValues({
      activeConsumableBroadGroup: "inventory_additives",
      initialQuickStartData: {
        brands: [],
        groups: [],
        recent: [],
        hasFavoritesAvailable: false,
        hasCustomAvailable: false
      },
      forcedGroup: "other"
    })).toContain("other");
  });

  it("prefers remembered category for a fresh add context and falls back to fermentables", () => {
    expect(resolveAddIngredientStartCategoryValue({
      rememberedCategoryValue: "hop"
    })).toBe("hop");

    expect(resolveAddIngredientStartCategoryValue({})).toBe("fermentable");

    expect(resolveAddIngredientStartCategoryValue({
      initialCategory: "fermentable",
      initialSubtype: "malt",
      rememberedCategoryValue: "hop"
    })).toBe("fermentable");
  });

  it("defaults fermentables to malt when no explicit chip context exists", () => {
    expect(resolveAddIngredientStartContext({})).toMatchObject({
      category: "fermentable",
      subtype: "malt",
      group: null
    });

    expect(resolveAddIngredientStartContext({
      rememberedCategoryValue: "fermentable"
    })).toMatchObject({
      category: "fermentable",
      subtype: "malt",
      group: null
    });
  });

  it("inherits explicit fermentable context instead of forcing malt", () => {
    expect(resolveAddIngredientStartContext({
      initialCategory: "fermentable",
      initialSubtype: "fermentable",
      initialGroup: "sugars_and_syrups"
    })).toMatchObject({
      category: "fermentable",
      subtype: "fermentable",
      group: "sugars_and_syrups"
    });
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

  it("treats the catalog add form as dirty only once the user has entered something", () => {
    const emptyState = {
      selected: null,
      pickerValue: "",
      enteredQuantity: "",
      optionalTouched: false,
      priceInputAmount: "",
      purchasedAt: "",
      freshnessDate: "",
      notes: "",
      purchaseLinksCount: 0
    };

    expect(isCatalogIngredientFormDirty(emptyState)).toBe(false);
    expect(isCatalogIngredientFormDirty({ ...emptyState, pickerValue: "Цитра" })).toBe(true);
    expect(isCatalogIngredientFormDirty({ ...emptyState, enteredQuantity: "100" })).toBe(true);
    expect(isCatalogIngredientFormDirty({
      ...emptyState,
      selected: {
        id: "hop-1",
        type: "hop",
        category: "hop",
        displayName: "Citra",
        primaryLabelRu: "Citra",
        defaultUnit: "g",
        source: "catalog"
      }
    })).toBe(true);
    // Необязательные поля не в счёт, пока пользователь не раскрыл секцию.
    expect(isCatalogIngredientFormDirty({ ...emptyState, notes: "заметка", optionalTouched: false })).toBe(false);
    expect(isCatalogIngredientFormDirty({ ...emptyState, notes: "заметка", optionalTouched: true })).toBe(true);
    expect(isCatalogIngredientFormDirty({ ...emptyState, purchaseLinksCount: 1, optionalTouched: true })).toBe(true);
  });

  it("treats the custom add form as dirty only once it diverges from its initial values", () => {
    const emptyState = {
      initialDisplayName: "",
      displayName: "",
      brand: "",
      country: "",
      harvestYear: "",
      fermentableColorEbc: "",
      fermentableExtractYieldPct: "",
      hopAlphaAcidPct: "",
      yeastAttenuationPct: "",
      waterTreatmentConcentrationPct: "",
      enteredQuantity: "",
      optionalTouched: false,
      priceInputAmount: "",
      purchasedAt: "",
      freshnessDate: "",
      notes: "",
      purchaseLinksCount: 0
    };

    expect(isCustomIngredientFormDirty(emptyState)).toBe(false);
    // Предзаполненное имя (например, из поиска) не само по себе не "грязное".
    expect(isCustomIngredientFormDirty({ ...emptyState, initialDisplayName: "Citra", displayName: "Citra" })).toBe(false);
    expect(isCustomIngredientFormDirty({ ...emptyState, initialDisplayName: "Citra", displayName: "Citra Cryo" })).toBe(true);
    expect(isCustomIngredientFormDirty({ ...emptyState, brand: "Yakima Chief" })).toBe(true);
    expect(isCustomIngredientFormDirty({ ...emptyState, enteredQuantity: "100" })).toBe(true);
    expect(isCustomIngredientFormDirty({ ...emptyState, notes: "заметка", optionalTouched: false })).toBe(false);
    expect(isCustomIngredientFormDirty({ ...emptyState, notes: "заметка", optionalTouched: true })).toBe(true);
  });

  // Ф7: раньше ref-гард ставил "applied" ДО проверки allowedUnits — при первом
  // несовпадении (initialUnit не входит в профиль стартовой категории) префилл
  // молча умирал навсегда, даже когда профиль потом становился подходящим.
  // Решение вынесено в чистый хелпер (resolveCustomIngredientAmountPrefillDecision),
  // чтобы не зависеть от DOM/эффектов при проверке.
  describe("resolveCustomIngredientAmountPrefillDecision — Ф7: гейт применяется по allowedUnits, а не единожды навсегда", () => {
    const base = {
      alreadyApplied: false,
      initialQuantity: "10",
      initialUnit: "ml",
      enteredQuantity: "",
      allowedUnits: ["kg", "g"] as const
    };

    it("initialUnit не входит в профиль стартовой категории → пропуск БЕЗ пометки applied", () => {
      expect(resolveCustomIngredientAmountPrefillDecision(base)).toEqual({ kind: "skip" });
    });

    it("профиль сменился на подходящий (allowedUnits включает initialUnit) → применяем", () => {
      expect(resolveCustomIngredientAmountPrefillDecision({
        ...base,
        allowedUnits: ["ml", "l"]
      })).toEqual({ kind: "apply", quantity: "10", unit: "ml" });
    });

    it("пользователь уже ввёл количество вручную → префилл не затирает его, но помечается применённым", () => {
      expect(resolveCustomIngredientAmountPrefillDecision({
        ...base,
        allowedUnits: ["ml", "l"],
        enteredQuantity: "3"
      })).toEqual({ kind: "mark_applied_no_change" });
    });

    it("уже применено (alreadyApplied) → всегда пропуск, даже если профиль сейчас подходит", () => {
      expect(resolveCustomIngredientAmountPrefillDecision({
        ...base,
        allowedUnits: ["ml", "l"],
        alreadyApplied: true
      })).toEqual({ kind: "skip" });
    });

    it("нет initialQuantity/initialUnit → пропуск (нечего применять)", () => {
      expect(resolveCustomIngredientAmountPrefillDecision({ ...base, initialQuantity: "" })).toEqual({ kind: "skip" });
      expect(resolveCustomIngredientAmountPrefillDecision({ ...base, initialUnit: null })).toEqual({ kind: "skip" });
    });
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
        hopAlphaAcidPct: "",
        waterTreatmentConcentrationPct: ""
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
        hopAlphaAcidPct: "6.1",
        waterTreatmentConcentrationPct: ""
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

    expect(resolveCatalogBatchOverrideSummaryState({
      defaults: {
        kind: "water_treatment_acid",
        waterTreatmentConcentrationPct: "88",
        concentrationPct: 88
      },
      overrides: {
        fermentableColorEbc: "",
        fermentableExtractYieldPct: "",
        hopAlphaAcidPct: "",
        waterTreatmentConcentrationPct: "75"
      },
      hasTechnicalOverrides: true
    })).toEqual({
      currentEntries: [
        { label: "Концентрация", value: "75%" }
      ],
      catalogEntries: [
        { label: "Концентрация", value: "88%" }
      ],
      statusBadgeLabel: "УТОЧНЕНО"
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

    expect(html).toContain("Цена, даты и заметки");
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

    expect(resolveCatalogDerivedVariantPresentation({
      selected: {
        id: "lactic-acid",
        type: "water_treatment",
        category: "water_treatment",
        subtype: "acid",
        displayName: "Молочная кислота",
        primaryLabelRu: "Молочная кислота",
        defaultUnit: "ml",
        technicalData: {
          type: "water_treatment",
          defaultConcentrationPct: 88
        },
        source: "catalog"
      },
      hasTechnicalOverrides: true
    })).toEqual({
      isDerivedVariantFlow: false,
      submitLabel: "Добавить в запасы",
      noticeText: null,
      inlineHelper: null
    });
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
    formData.set("country", "Бельгия");
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
      country: "Бельгия",
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

  it("passes hop form through custom ingredient add flow", async () => {
    const formData = new FormData();
    formData.set("category", "hop");
    formData.set("displayName", "Citra");
    formData.set("brand", "Yakima Chief");
    formData.set("hopForm", "cryo");
    formData.set("hopAlphaAcidPct", "12.5");
    formData.set("harvestYear", "2025");
    formData.set("defaultDisplayUnit", "g");
    formData.set("enteredQuantity", "100");
    formData.set("enteredUnit", "g");

    const result = await addCustomIngredientAction(null, formData);

    expect(result.ok).toBe(true);
    expect(mockState.createCustomCalls).toHaveLength(1);
    expect(mockState.createCustomCalls[0]).toMatchObject({
      category: "hop",
      hopForm: "cryo",
      hopAlphaAcidPct: 12.5,
      harvestYear: 2025
    });
  });

  it("passes water treatment acid concentration through custom ingredient add flow", async () => {
    const formData = new FormData();
    formData.set("category", "water_treatment");
    formData.set("subtype", "acid");
    formData.set("displayName", "Молочная кислота");
    formData.set("waterTreatmentConcentrationPct", "75");
    formData.set("defaultDisplayUnit", "ml");
    formData.set("enteredQuantity", "100");
    formData.set("enteredUnit", "ml");

    const result = await addCustomIngredientAction(null, formData);

    expect(result.ok).toBe(true);
    expect(mockState.createCustomCalls).toHaveLength(1);
    expect(mockState.createCustomCalls[0]).toMatchObject({
      category: "water_treatment",
      subtype: "acid",
      waterTreatmentConcentrationPct: 75
    });
  });

  it("allows quick custom creation with only name and quantity", async () => {
    const formData = new FormData();
    formData.set("category", "hop");
    formData.set("displayName", "Citra");
    formData.set("defaultDisplayUnit", "g");
    formData.set("enteredQuantity", "100");
    formData.set("enteredUnit", "g");

    const result = await addCustomIngredientAction(null, formData);

    expect(result.ok).toBe(true);
    expect(mockState.createCustomCalls).toHaveLength(1);
    expect(mockState.createCustomCalls[0]).toMatchObject({
      category: "hop",
      displayName: "Citra",
      defaultDisplayUnit: "g"
    });
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

  it("stores catalog acid concentration through the catalog inventory path", async () => {
    mockState.resolveCatalogSourceMode = "custom";

    const formData = new FormData();
    formData.set("ingredientCatalogItemId", "lactic-acid");
    formData.set("enteredQuantity", "100");
    formData.set("enteredUnit", "ml");
    formData.set("waterTreatmentConcentrationPct", "75");

    const result = await addSelectedIngredientAction(null, formData);

    expect(result.ok).toBe(true);
    expect(mockState.resolveCatalogSourceCalls).toHaveLength(0);
    expect(mockState.addCatalogCalls).toHaveLength(1);
    expect(mockState.addCatalogCalls[0]).toMatchObject({
      ingredientCatalogItemId: "lactic-acid",
      enteredQuantity: 100,
      enteredUnit: "ml",
      waterTreatmentConcentrationPct: 75
    });
    expect(mockState.addCustomCalls).toHaveLength(0);
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

  it("updates catalog acid concentration as an inventory item property", async () => {
    mockState.resolveCatalogSourceMode = "custom";

    const result = await updateInventoryItemAction({
      inventoryItemId: "inv-acid-1",
      ingredientCatalogItemId: "lactic-acid",
      waterTreatmentConcentrationPct: "75",
      enteredQuantity: "100",
      enteredUnit: "ml"
    });

    expect(result.ok).toBe(true);
    expect(mockState.resolveCatalogSourceCalls).toHaveLength(0);
    expect(mockState.updateItemCalls).toEqual([
      {
        inventoryItemId: "inv-acid-1",
        payload: expect.objectContaining({
          ingredientCatalogItemId: "lactic-acid",
          userCustomIngredientId: null,
          waterTreatmentConcentrationPct: 75,
          enteredQuantity: 100,
          enteredUnit: "ml"
        })
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
    expect(getCustomIngredientSubtypeOptions("consumable")).toContain("technical_additives");
    expect(getCustomIngredientSubtypeOptions("consumable")).toContain("citrus_zest");
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
        hopAlphaAcidPct: "",
        waterTreatmentConcentrationPct: ""
      }
    })).toBe(false);
    expect(hasCatalogIngredientTechnicalOverrides({
      selected,
      overrides: {
        fermentableColorEbc: "6.5",
        fermentableExtractYieldPct: "82",
        hopAlphaAcidPct: "",
        waterTreatmentConcentrationPct: ""
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
        hopAlphaAcidPct: "",
        waterTreatmentConcentrationPct: ""
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
        hopAlphaAcidPct: "",
        waterTreatmentConcentrationPct: ""
      }
    })).toBe(false);
  });

  it("recognizes catalog acid concentration when itemKind is a specific acid token", () => {
    const selected = {
      id: "lactic-acid",
      type: "water_treatment" as const,
      category: "water_treatment" as const,
      subtype: "other" as const,
      itemKind: "lactic_acid",
      displayName: "Молочная кислота",
      defaultUnit: "ml" as const,
      source: "catalog" as const,
      technicalData: {
        type: "water_treatment" as const,
        defaultConcentrationPct: 88,
        unitPreferred: "ml"
      }
    };

    expect(resolveCatalogBatchOverrideDefaults(selected)).toMatchObject({
      kind: "water_treatment_acid",
      waterTreatmentConcentrationPct: "88",
      concentrationPct: 88
    });
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
