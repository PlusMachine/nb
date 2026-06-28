import { beforeEach, describe, expect, it, vi } from "vitest";

// Покрытие browse/list/picker-availability/деталь каталога ингредиентов.
//
// Конвенция: сервис-слой тестируется БЕЗ реальной БД. `@nb/db` мокается
// in-memory через vi.hoisted + vi.mock, `server-only` глушится. В отличие от
// существующего харнесса для поиска, здесь МЫ НЕ мокаем `./service`: реальные
// loadIngredients / getIngredientById / listCatalogIngredients прогоняются на
// raw-строках каталога, чтобы покрыть и публичный browse (service.ts), и
// маппинг/агрегацию (catalog-service.ts) одним проходом.
//
// Граница: свободнотекстовый ПОИСК (searchUserCatalogIngredients, ранжирование
// по запросу) — НЕ здесь, его покрывает отдельный набор. Здесь — листинг,
// фильтрация по типу/подтипу, фасеты, quick-start availability по контексту,
// деталь по ref и презентация-маппинг.

const now = new Date("2026-03-27T10:00:00.000Z");

const mockState = vi.hoisted(() => ({
  ingredientRows: [] as any[],
  customRows: [] as any[],
  proposals: [] as any[],
  favoriteKeys: new Set<string>(),
  purchaseLinks: [] as any[]
}));

// Рекурсивно собирает строковые значения из mock-структуры where (and/eq
// замоканы как массивы), чтобы findFirst мог сопоставить id/userId.
const collectStrings = (node: unknown, acc: Set<string>) => {
  if (node == null) {
    return;
  }

  if (typeof node === "string") {
    acc.add(node);
    return;
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      collectStrings(child, acc);
    }
    return;
  }

  if (typeof node === "object") {
    for (const child of Object.values(node as Record<string, unknown>)) {
      collectStrings(child, acc);
    }
  }
};

const whereValues = (where: unknown) => {
  const acc = new Set<string>();
  collectStrings(where, acc);
  return acc;
};

const buildAliasRow = (overrides: Record<string, unknown> = {}) => ({
  id: "alias-1",
  ingredientId: "ingredient-1",
  locale: "ru",
  alias: "Алиас",
  aliasNormalized: "алиас",
  source: "seed",
  isEnabled: true,
  createdAt: now,
  updatedAt: now,
  ...overrides
});

const buildSourceRow = (overrides: Record<string, unknown> = {}) => ({
  id: "source-1",
  ingredientId: "ingredient-1",
  kind: "lab",
  label: "Источник",
  url: null,
  sourceBasis: null,
  position: 0,
  createdAt: now,
  updatedAt: now,
  ...overrides
});

const buildVariantRow = (overrides: Record<string, unknown> = {}) => ({
  id: "variant-1",
  ingredientId: "ingredient-1",
  brand: "Brand",
  productNameEn: "Product",
  productNameRu: "Продукт",
  countryNameRu: "Россия",
  packageAmount: 100,
  packageUnit: "g",
  stockContentAmount: 100,
  stockContentUnit: "g",
  sourceGroup: null,
  sourceUrl: null,
  isDefaultForStock: true,
  position: 0,
  createdAt: now,
  updatedAt: now,
  ...overrides
});

// Raw-строка каталога в форме DB-ряда (как в ingredient-service-foundation.test).
const buildIngredientRow = (overrides: Record<string, unknown> = {}) => ({
  id: "ingredient-1",
  type: "malt",
  nameRu: "Пилснер",
  nameEn: "Pilsner Malt",
  displayModeRu: "localized_first",
  displayNameOverrideRu: null,
  secondaryNameOverrideRu: null,
  hideSecondaryNameRu: false,
  isActive: true,
  countryCode: "BE",
  countryName: "Belgium",
  brand: null,
  producer: null,
  productCode: null,
  groupName: null,
  category: null,
  subcategory: null,
  itemKind: "malt",
  presentOnBirrf: true,
  inventoryEnabled: true,
  attributes: {},
  quantityDefaults: null,
  createdAt: now,
  updatedAt: now,
  aliases: [] as any[],
  sources: [] as any[],
  packageVariants: [] as any[],
  ...overrides
});

// Raw-строка пользовательского (custom) ингредиента.
const buildCustomRow = (overrides: Record<string, unknown> = {}) => {
  const overrideProperties = (overrides.properties as Record<string, unknown> | undefined) ?? {};
  const baseProperties = {
    category: "fermentable",
    subtype: "malt",
    nameEn: "Custom Malt",
    aliases: []
  };
  const baseRow = {
    id: "custom-ingredient-1",
    userId: "user-1",
    type: "fermentable",
    displayName: "Мой солод",
    manufacturer: null,
    country: null,
    properties: baseProperties,
    hopAlphaAcidPct: null,
    hopForm: null,
    fermentableExtractYieldPct: 80,
    fermentableColorEbc: 4,
    yeastAttenuationPct: null,
    yeastForm: null,
    yeastMinFermentationTempC: null,
    yeastMaxFermentationTempC: null,
    createdAt: now,
    updatedAt: now
  };

  return {
    ...baseRow,
    ...overrides,
    properties: {
      ...baseProperties,
      ...overrideProperties
    }
  };
};

vi.mock("server-only", () => ({}));

vi.mock("../features/ingredients/user-metadata-service", () => ({
  applyFavoriteStateToCatalogItems: async (_userId: string, items: any[]) => items.map((item) => ({
    ...item,
    isFavorite: mockState.favoriteKeys.has(`${item.source}:${item.id}`)
  })),
  listIngredientPurchaseLinksByReference: async () => mockState.purchaseLinks
}));

vi.mock("@nb/db", () => ({
  db: {
    query: {
      ingredients: {
        findMany: async (args: { where?: unknown } = {}) => {
          // loadIngredients({ includeInactive }) добавляет eq(isActive, true)
          // только когда нужны активные; распознаём это по сериализации where.
          const activeOnly = JSON.stringify(args.where ?? null).includes("isActive");
          return activeOnly
            ? mockState.ingredientRows.filter((row) => row.isActive !== false)
            : mockState.ingredientRows;
        },
        findFirst: async (args: { where?: unknown } = {}) => {
          const values = whereValues(args.where);
          return mockState.ingredientRows.find((row) => values.has(row.id)) ?? null;
        }
      },
      proposedIngredients: {
        findMany: async () => mockState.proposals
      },
      userCustomIngredients: {
        findMany: async (args: { where?: unknown } = {}) => {
          const values = whereValues(args.where);
          return mockState.customRows.filter((row) => values.has(row.userId));
        },
        findFirst: async (args: { where?: unknown } = {}) => {
          const values = whereValues(args.where);
          return mockState.customRows.find((row) => values.has(row.id) && values.has(row.userId)) ?? null;
        }
      }
    },
    // applyUsageCounts: возвращаем пустые агрегаты (нулевые usage-счётчики).
    select: (_shape: Record<string, unknown>) => ({
      from: () => ({
        where: () => ({
          groupBy: async () => []
        }),
        innerJoin: () => ({
          where: () => ({
            groupBy: async () => []
          })
        })
      })
    })
  },
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  inArray: (...args: unknown[]) => args,
  isNull: (...args: unknown[]) => args,
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
  ingredientAliases: { ingredientId: "ingredientId" },
  ingredientPackageVariants: { ingredientId: "ingredientId" },
  ingredients: { id: "id", isActive: "isActive", type: "type" },
  ingredientSources: { ingredientId: "ingredientId" },
  proposedIngredients: { status: "status" },
  recipeIngredients: { ingredientCatalogItemId: "ingredientCatalogItemId", userCustomIngredientId: "userCustomIngredientId", recipeId: "recipeId" },
  recipes: { id: "id", authorId: "authorId" },
  userCustomIngredients: { userId: "userId", id: "id" },
  userIngredients: { ingredientCatalogItemId: "ingredientCatalogItemId", userCustomIngredientId: "userCustomIngredientId", userId: "userId", archivedAt: "archivedAt" }
}));

import {
  getIngredientPickerQuickStartAvailability,
  getIngredientPickerQuickStartAvailabilityByContext,
  getIngredientPickerQuickStartBySubtype,
  getIngredientSuggestionByRef,
  getUserCatalogIngredientByRef,
  listIngredientPickerQuickStart,
  listUserCatalogIngredients,
  toIngredientSuggestionItem
} from "../features/ingredients/catalog-service";
import {
  getIngredientById,
  listCatalogIngredients
} from "../features/ingredients/service";

beforeEach(() => {
  mockState.ingredientRows = [];
  mockState.customRows = [];
  mockState.proposals = [];
  mockState.favoriteKeys = new Set();
  mockState.purchaseLinks = [];
});

describe("каталог: листинг пользовательского каталога", () => {
  it("пустой каталог отдаёт нулевые итоги и нулевые фасеты", async () => {
    const result = await listUserCatalogIngredients(null, {});

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.totalPages).toBe(1);
    expect(result.facets.byCategory).toEqual({
      fermentable: 0,
      hop: 0,
      yeast: 0,
      consumable: 0,
      water_treatment: 0
    });
    expect(result.facets.byFermentableSubtype).toEqual({ malt: 0, fermentable: 0 });
    expect(result.facets.customCount).toBe(0);
    expect(result.facets.catalogCount).toBe(0);
  });

  it("фильтрует по категории и считает фасеты по всем категориям", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "malt-1", type: "malt", nameRu: "Пилснер", itemKind: "malt" }),
      buildIngredientRow({ id: "ferm-1", type: "fermentable", nameRu: "Декстроза", itemKind: "sugar" }),
      buildIngredientRow({ id: "hop-1", type: "hop", nameRu: "Каскад", itemKind: "hop" }),
      buildIngredientRow({ id: "yeast-1", type: "yeast", nameRu: "US-05", itemKind: "yeast" }),
      buildIngredientRow({ id: "cons-1", type: "consumable", nameRu: "Стар Сан", itemKind: "sanitizer" }),
      buildIngredientRow({ id: "wt-1", type: "water_treatment", nameRu: "Хлорид кальция", itemKind: "salt" })
    ];

    const result = await listUserCatalogIngredients(null, { category: "hop" });

    expect(result.items.map((item) => item.id)).toEqual(["hop-1"]);
    expect(result.total).toBe(1);
    // byCategory считается по всему набору, filteredByCategory — по отфильтрованному.
    expect(result.facets.byCategory).toEqual({
      fermentable: 2,
      hop: 1,
      yeast: 1,
      consumable: 1,
      water_treatment: 1
    });
    expect(result.facets.filteredByCategory).toEqual({
      fermentable: 0,
      hop: 1,
      yeast: 0,
      consumable: 0,
      water_treatment: 0
    });
    expect(result.facets.byFermentableSubtype).toEqual({ malt: 1, fermentable: 1 });
    expect(result.facets.catalogCount).toBe(6);
    expect(result.facets.customCount).toBe(0);
  });

  it("фильтрует ферментируемые по подтипу malt против fermentable", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "malt-1", type: "malt", nameRu: "Пилснер", itemKind: "malt" }),
      buildIngredientRow({ id: "ferm-1", type: "fermentable", nameRu: "Декстроза", itemKind: "sugar" })
    ];

    const maltOnly = await listUserCatalogIngredients(null, { category: "fermentable", subtype: "malt" });
    const fermentableOnly = await listUserCatalogIngredients(null, { category: "fermentable", subtype: "fermentable" });

    expect(maltOnly.items.map((item) => item.id)).toEqual(["malt-1"]);
    expect(maltOnly.items.every((item) => item.subtype === "malt")).toBe(true);
    expect(fermentableOnly.items.map((item) => item.id)).toEqual(["ferm-1"]);
    expect(fermentableOnly.items.every((item) => item.subtype === "fermentable")).toBe(true);
  });

  it("view=mine оставляет только пользовательские позиции, но фасеты считают и каталожные", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "catalog-hop", type: "hop", nameRu: "Каскад", itemKind: "hop" })
    ];
    mockState.customRows = [
      buildCustomRow({ id: "custom-malt", type: "fermentable", displayName: "Мой солод", properties: { category: "fermentable", subtype: "malt", nameEn: "My Malt", aliases: [] } }),
      buildCustomRow({ id: "custom-hop", type: "hop", displayName: "Мой хмель", hopAlphaAcidPct: 8, fermentableExtractYieldPct: null, fermentableColorEbc: null, properties: { category: "hop", subtype: "hop", nameEn: "My Hop", aliases: [] } })
    ];

    const result = await listUserCatalogIngredients("user-1", { view: "mine" });

    expect(result.items.map((item) => item.id).sort()).toEqual(["custom-hop", "custom-malt"]);
    expect(result.items.every((item) => item.source === "custom")).toBe(true);
    expect(result.facets.customCount).toBe(2);
    expect(result.facets.catalogCount).toBe(1);
  });

  it("сортирует по имени и режет страницами (sort=name по умолчанию)", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "b", type: "malt", nameRu: "Берёзовый", itemKind: "malt" }),
      buildIngredientRow({ id: "a", type: "malt", nameRu: "Абрикосовый", itemKind: "malt" }),
      buildIngredientRow({ id: "v", type: "malt", nameRu: "Викторианский", itemKind: "malt" })
    ];

    const firstPage = await listUserCatalogIngredients(null, { pageSize: 2, page: 1 });
    const secondPage = await listUserCatalogIngredients(null, { pageSize: 2, page: 2 });

    expect(firstPage.total).toBe(3);
    expect(firstPage.totalPages).toBe(2);
    expect(firstPage.items.map((item) => item.primaryLabelRu)).toEqual(["Абрикосовый", "Берёзовый"]);
    expect(secondPage.page).toBe(2);
    expect(secondPage.items.map((item) => item.primaryLabelRu)).toEqual(["Викторианский"]);
  });
});

describe("каталог: деталь ингредиента по ref", () => {
  const detailRow = () => buildIngredientRow({
    id: "detail-cat",
    type: "consumable",
    nameRu: "Звёздный санитайзер",
    nameEn: "Star Sanitizer",
    itemKind: "sanitizer",
    aliases: [
      buildAliasRow({ id: "al-2", ingredientId: "detail-cat", alias: "Яблочный", aliasNormalized: "яблочный" }),
      buildAliasRow({ id: "al-1", ingredientId: "detail-cat", alias: "Абрикосовый", aliasNormalized: "абрикосовый" })
    ],
    sources: [
      buildSourceRow({ id: "src-2", ingredientId: "detail-cat", label: "s2", position: 2 }),
      buildSourceRow({ id: "src-0", ingredientId: "detail-cat", label: "s0", position: 0 }),
      buildSourceRow({ id: "src-1", ingredientId: "detail-cat", label: "s1", position: 1 })
    ],
    packageVariants: [
      buildVariantRow({ id: "pv-1", ingredientId: "detail-cat", brand: "v1", position: 1 }),
      buildVariantRow({ id: "pv-0", ingredientId: "detail-cat", brand: "v0", position: 0 })
    ]
  });

  it("каталожный ref агрегирует и упорядочивает алиасы/источники/фасовки и прикладывает purchaseLinks", async () => {
    mockState.ingredientRows = [detailRow()];
    mockState.purchaseLinks = [{ id: "pl-1", url: "https://shop.example", label: "Магазин" }];

    const item = await getUserCatalogIngredientByRef("user-1", "catalog", "detail-cat");

    expect(item).not.toBeNull();
    expect(item?.source).toBe("catalog");
    expect(item?.aliases.map((alias) => alias.alias)).toEqual(["Абрикосовый", "Яблочный"]);
    expect(item?.sources.map((source) => source.label)).toEqual(["s0", "s1", "s2"]);
    expect(item?.packageVariants.map((variant) => variant.brand)).toEqual(["v0", "v1"]);
    expect(item?.purchaseLinks).toHaveLength(1);
  });

  it("неизвестный каталожный ref возвращает null", async () => {
    mockState.ingredientRows = [detailRow()];

    await expect(getUserCatalogIngredientByRef("user-1", "catalog", "missing")).resolves.toBeNull();
  });

  it("custom ref доступен владельцу", async () => {
    mockState.customRows = [
      buildCustomRow({ id: "owned-custom", userId: "user-1", displayName: "Мой солод" })
    ];

    const item = await getUserCatalogIngredientByRef("user-1", "custom", "owned-custom");

    expect(item?.id).toBe("owned-custom");
    expect(item?.source).toBe("custom");
  });

  it("custom ref недоступен без сессии и чужому пользователю", async () => {
    mockState.customRows = [
      buildCustomRow({ id: "owned-custom", userId: "user-1", displayName: "Мой солод" })
    ];

    await expect(getUserCatalogIngredientByRef(null, "custom", "owned-custom")).resolves.toBeNull();
    await expect(getUserCatalogIngredientByRef("user-2", "custom", "owned-custom")).resolves.toBeNull();
  });

  it("подтягивает derivedFromDisplayName из базового каталожного ингредиента", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "base-cat", type: "malt", nameRu: "Базовый солод", itemKind: "malt" })
    ];
    mockState.customRows = [
      buildCustomRow({
        id: "derived-custom",
        userId: "user-1",
        displayName: "Производный солод",
        properties: {
          category: "fermentable",
          subtype: "malt",
          nameEn: "Derived Malt",
          aliases: [],
          derivedFromIngredientId: "base-cat"
        }
      })
    ];

    const item = await getUserCatalogIngredientByRef("user-1", "custom", "derived-custom");

    expect(item?.derivedFromIngredientId).toBe("base-cat");
    expect(item?.derivedFromDisplayName).toBe("Базовый солод");
  });
});

describe("каталог: suggestion-маппинг по ref", () => {
  const hopRow = () => buildIngredientRow({
    id: "hop-suggest",
    type: "hop",
    nameRu: "Каскад",
    nameEn: "Cascade",
    itemKind: "hop",
    brand: "Yakima Chief",
    producer: "Yakima Chief",
    countryName: "США"
  });

  it("getIngredientSuggestionByRef отдаёт suggestion-item для известного ref и null для неизвестного", async () => {
    mockState.ingredientRows = [hopRow()];

    const suggestion = await getIngredientSuggestionByRef("user-1", "catalog", "hop-suggest");
    expect(suggestion).toMatchObject({ id: "hop-suggest", source: "catalog" });
    expect(suggestion?.subtitle).toContain("Yakima Chief");

    await expect(getIngredientSuggestionByRef("user-1", "catalog", "nope")).resolves.toBeNull();
  });

  it("toIngredientSuggestionItem собирает subtitle и проставляет score/isFavorite по умолчанию", async () => {
    mockState.ingredientRows = [hopRow()];

    const dto = await getUserCatalogIngredientByRef("user-1", "catalog", "hop-suggest");
    expect(dto).not.toBeNull();

    const withoutScore = toIngredientSuggestionItem(dto!);
    expect(withoutScore.id).toBe("hop-suggest");
    expect(withoutScore.source).toBe("catalog");
    expect(withoutScore.isFavorite).toBe(false);
    expect(withoutScore.score).toBeUndefined();
    expect(withoutScore.subtitle).toContain("Yakima Chief");

    const withScore = toIngredientSuggestionItem(dto!, 42);
    expect(withScore.score).toBe(42);
  });
});

describe("каталог: quick-start availability по контексту", () => {
  it("getIngredientPickerQuickStartBySubtype отдаёт оба подтипа с флагами favorites/custom", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "qs-malt", type: "malt", nameRu: "Пилснер", itemKind: "malt" })
    ];
    mockState.customRows = [
      buildCustomRow({
        id: "qs-ferm",
        type: "fermentable",
        displayName: "Мой экстракт",
        properties: { category: "fermentable", subtype: "fermentable", nameEn: "My Extract", aliases: [] }
      })
    ];
    mockState.favoriteKeys = new Set(["catalog:qs-malt"]);

    const result = await getIngredientPickerQuickStartBySubtype("user-1");

    expect(result.malt.hasFavoritesAvailable).toBe(true);
    expect(result.malt.hasCustomAvailable).toBe(false);
    expect(result.malt.recent).toEqual([]);
    expect(result.fermentable.hasFavoritesAvailable).toBe(false);
    expect(result.fermentable.hasCustomAvailable).toBe(true);
  });

  it("getIngredientPickerQuickStartAvailabilityByContext сводит флаги по всем контекстам", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "ctx-malt", type: "malt", nameRu: "Пилснер", itemKind: "malt" }),
      buildIngredientRow({ id: "ctx-hop", type: "hop", nameRu: "Каскад", itemKind: "hop" })
    ];
    mockState.customRows = [
      buildCustomRow({
        id: "ctx-ferm",
        type: "fermentable",
        displayName: "Мой экстракт",
        properties: { category: "fermentable", subtype: "fermentable", nameEn: "My Extract", aliases: [] }
      }),
      buildCustomRow({
        id: "ctx-yeast",
        type: "yeast",
        displayName: "Мои дрожжи",
        yeastAttenuationPct: 78,
        fermentableExtractYieldPct: null,
        fermentableColorEbc: null,
        properties: { category: "yeast", subtype: "yeast", nameEn: "My Yeast", aliases: [] }
      })
    ];
    mockState.favoriteKeys = new Set(["catalog:ctx-malt", "catalog:ctx-hop"]);

    const result = await getIngredientPickerQuickStartAvailabilityByContext("user-1");

    expect(result.malt.hasFavoritesAvailable).toBe(true);
    expect(result.fermentable.hasCustomAvailable).toBe(true);
    expect(result.hop).toEqual({ hasFavoritesAvailable: true, hasCustomAvailable: false });
    expect(result.yeast).toEqual({ hasFavoritesAvailable: false, hasCustomAvailable: true });
    expect(result.water_treatment).toEqual({ hasFavoritesAvailable: false, hasCustomAvailable: false });
    expect(result.consumable).toEqual({ hasFavoritesAvailable: false, hasCustomAvailable: false });
  });

  it("неподдерживаемый контекст (fermentable без подтипа) даёт пустой quick-start и нулевую availability", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "qs-malt", type: "malt", nameRu: "Пилснер", itemKind: "malt" })
    ];

    await expect(listIngredientPickerQuickStart("user-1", { category: "fermentable" })).resolves.toEqual({
      brands: [],
      groups: [],
      recent: [],
      hasFavoritesAvailable: false,
      hasCustomAvailable: false
    });

    await expect(getIngredientPickerQuickStartAvailability("user-1", { category: "fermentable" })).resolves.toEqual({
      hasFavoritesAvailable: false,
      hasCustomAvailable: false
    });
  });
});

describe("каталог: публичный browse (service.ts)", () => {
  it("пустой каталог отдаёт нулевые фасеты статусов/категорий и нет pending-предложений", async () => {
    const result = await listCatalogIngredients({});

    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(1);
    expect(result.pendingProposals).toBe(0);
    expect(result.facets.byCategory).toEqual({
      fermentable: 0,
      hop: 0,
      yeast: 0,
      consumable: 0,
      water_treatment: 0
    });
    expect(result.facets.byStatus).toEqual({ active: 0, draft: 0, archived: 0, merged: 0 });
  });

  it("сводит статусы и категории в фасеты и считает pending-предложения", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "st-active", type: "hop", nameRu: "Каскад", itemKind: "hop", isActive: true, attributes: {} }),
      buildIngredientRow({ id: "st-draft", type: "yeast", nameRu: "US-05", itemKind: "yeast", isActive: true, attributes: { _catalog_status: "draft" } }),
      buildIngredientRow({ id: "st-archived", type: "malt", nameRu: "Пилснер", itemKind: "malt", isActive: false, attributes: {} }),
      buildIngredientRow({ id: "st-merged", type: "consumable", nameRu: "Стар Сан", itemKind: "sanitizer", isActive: false, attributes: { _catalog_status: "merged" } })
    ];
    mockState.proposals = [{ id: "p1" }, { id: "p2" }];

    const result = await listCatalogIngredients({});

    expect(result.total).toBe(4);
    expect(result.pendingProposals).toBe(2);
    expect(result.facets.byStatus).toEqual({ active: 1, draft: 1, archived: 1, merged: 1 });
    expect(result.facets.byCategory).toEqual({
      fermentable: 1,
      hop: 1,
      yeast: 1,
      consumable: 1,
      water_treatment: 0
    });
  });

  it("фильтрует каталог по статусу", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "st-active", type: "hop", nameRu: "Каскад", itemKind: "hop", isActive: true, attributes: {} }),
      buildIngredientRow({ id: "st-draft", type: "yeast", nameRu: "US-05", itemKind: "yeast", isActive: true, attributes: { _catalog_status: "draft" } })
    ];

    const result = await listCatalogIngredients({ status: "draft" });

    expect(result.total).toBe(1);
    expect(result.items.map((item) => item.id)).toEqual(["st-draft"]);
    expect(result.facets.byStatus.draft).toBe(1);
  });

  it("getIngredientById отдаёт деталь по id и null для неизвестного", async () => {
    mockState.ingredientRows = [
      buildIngredientRow({ id: "byid-1", type: "malt", nameRu: "Пилснер", nameEn: "Pilsner", itemKind: "malt" })
    ];

    const found = await getIngredientById("byid-1");
    expect(found?.id).toBe("byid-1");
    expect(found?.primaryLabelRu).toBe("Пилснер");

    await expect(getIngredientById("byid-missing")).resolves.toBeNull();
  });
});
