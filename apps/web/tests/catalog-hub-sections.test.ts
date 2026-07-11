import { beforeEach, describe, expect, it, vi } from "vitest";

// Юнит-тесты сервисной функции listCatalogHubSections (хаб /catalog без
// landing, S1 в notes/catalog-hub-redesign.md). Мок уровня B — как в
// catalog-search-noise-and-sort.test.ts:104-146: ./service мокается напрямую
// (loadIngredients отдаёт уже-DTO-подобные записи, реальный ranking.ts НЕ
// мокается), @nb/db мокается частично (usage-агрегаты + userCustomIngredients).

const now = new Date("2026-03-27T10:00:00.000Z");

const mockState = vi.hoisted(() => ({
  catalogItems: [] as any[],
  customItems: [] as any[],
  favoriteKeys: new Set<string>()
}));

// Форма — как у Awaited<ReturnType<typeof loadIngredients>>[number] (то, что
// mapSystemIngredient превращает в UserCatalogIngredientDto, добавляя source).
const buildCatalogItem = (overrides: Record<string, unknown> = {}) => ({
  id: "ingredient-1",
  type: "fermentable",
  category: "fermentable",
  subtype: "malt",
  familyId: null,
  family: null,
  primaryLabelRu: "Pilsner 2RS",
  secondaryLabelRu: "Pilsner Malt",
  displayName: "Pilsner 2RS",
  displayNameRu: "Pilsner 2RS",
  displayNameEn: "Pilsner Malt",
  nameRu: "Pilsner 2RS",
  nameEn: "Pilsner Malt",
  displayModeRu: "source_first",
  displayNameOverrideRu: null,
  secondaryNameOverrideRu: null,
  hideSecondaryNameRu: false,
  brand: null,
  producer: null,
  brandName: null,
  manufacturer: null,
  country: null,
  countryCode: null,
  countryName: null,
  productCode: null,
  groupName: null,
  sourceCategory: null,
  subcategory: null,
  itemKind: "malt",
  presentOnBirrf: true,
  isActive: true,
  inventoryEnabled: true,
  attributes: {},
  technicalData: null,
  aliases: [],
  sources: [],
  packageVariants: [],
  quantityDefaults: null,
  unitPreferred: null,
  defaultUnit: "kg",
  defaultDisplayUnit: "kg",
  allowedUnits: ["kg", "g"],
  measurementDimension: "mass",
  completenessLevel: "canonical",
  status: "active",
  visibility: "public",
  mergedIntoId: null,
  createdAt: now,
  updatedAt: now,
  ...overrides
});

// Raw-строка пользовательского (custom) ингредиента — как buildCustomRow в
// coverage-catalog-browse.test.ts (форма typeof userCustomIngredients.$inferSelect).
const buildCustomItem = (overrides: Record<string, unknown> = {}) => {
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

vi.mock("../features/ingredients/service", () => ({
  loadIngredients: async () => mockState.catalogItems,
  getIngredientById: async (id: string) => mockState.catalogItems.find((item) => item.id === id) ?? null
}));

vi.mock("../features/ingredients/user-metadata-service", () => ({
  applyFavoriteStateToCatalogItems: async (_userId: string, items: any[]) => items.map((item) => ({
    ...item,
    isFavorite: mockState.favoriteKeys.has(`${item.source}:${item.id}`)
  })),
  listIngredientPurchaseLinksByReference: async () => []
}));

vi.mock("@nb/db", () => ({
  db: {
    query: {
      userCustomIngredients: {
        findMany: async () => mockState.customItems
      }
    },
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
  recipeIngredients: { ingredientCatalogItemId: "ingredientCatalogItemId", userCustomIngredientId: "userCustomIngredientId" },
  recipes: { id: "id", authorId: "authorId" },
  userCustomIngredients: { userId: "userId", id: "id" },
  userIngredients: { ingredientCatalogItemId: "ingredientCatalogItemId", userCustomIngredientId: "userCustomIngredientId", userId: "userId", archivedAt: "archivedAt" }
}));

import {
  CATALOG_HUB_PREVIEW_LIMIT,
  CATALOG_HUB_SEARCH_GROUP_LIMIT,
  listCatalogHubSections,
  listUserCatalogIngredients
} from "../features/ingredients/catalog-service";
import { normalizeSearchText } from "../features/ingredients/normalization";

const canonicalSlugOrder = ["malts", "fermentables", "hops", "yeast", "water", "additives", "consumables"];

beforeEach(() => {
  mockState.catalogItems = [];
  mockState.customItems = [];
  mockState.favoriteKeys = new Set();
});

describe("listCatalogHubSections: партиционирование без q", () => {
  it("пустой каталог отдаёт все 6 секций с total=0 в каноническом порядке", async () => {
    const result = await listCatalogHubSections(null, {});

    expect(result.sections.map((section) => section.slug)).toEqual(canonicalSlugOrder);
    expect(result.sections.every((section) => section.total === 0 && section.items.length === 0)).toBe(true);
    expect(result.total).toBe(0);
    expect(result.facets.byCategory).toEqual({
      fermentable: 0,
      hop: 0,
      yeast: 0,
      consumable: 0,
      water_treatment: 0
    });
    expect(result.facets.byFermentableSubtype).toEqual({ malt: 0, fermentable: 0 });
  });

  it("раскладывает по одной позиции каждой из 7 секций в канонический порядок", async () => {
    mockState.catalogItems = [
      buildCatalogItem({ id: "malt-1", type: "malt", category: "fermentable", subtype: "malt", itemKind: "malt", primaryLabelRu: "Солод", displayName: "Солод" }),
      buildCatalogItem({ id: "ferm-1", type: "fermentable", category: "fermentable", subtype: "fermentable", itemKind: "sugar", primaryLabelRu: "Декстроза", displayName: "Декстроза" }),
      buildCatalogItem({ id: "hop-1", type: "hop", category: "hop", subtype: "hop", itemKind: "hop", primaryLabelRu: "Каскад", displayName: "Каскад" }),
      buildCatalogItem({ id: "yeast-1", type: "yeast", category: "yeast", subtype: "yeast", itemKind: "yeast", primaryLabelRu: "US-05", displayName: "US-05" }),
      buildCatalogItem({ id: "wt-1", type: "water_treatment", category: "water_treatment", subtype: null, itemKind: "salt", primaryLabelRu: "Хлорид кальция", displayName: "Хлорид кальция" }),
      buildCatalogItem({ id: "additive-1", type: "consumable", category: "consumable", subtype: null, itemKind: "spice", primaryLabelRu: "Кориандр", displayName: "Кориандр" }),
      buildCatalogItem({ id: "cons-1", type: "consumable", category: "consumable", subtype: null, itemKind: "sanitizer", primaryLabelRu: "Стар Сан", displayName: "Стар Сан" })
    ];

    const result = await listCatalogHubSections(null, {});

    expect(result.sections.map((section) => section.slug)).toEqual(canonicalSlugOrder);
    const bySlug = new Map(result.sections.map((section) => [section.slug, section]));
    expect(bySlug.get("malts")?.items.map((item) => item.id)).toEqual(["malt-1"]);
    expect(bySlug.get("fermentables")?.items.map((item) => item.id)).toEqual(["ferm-1"]);
    expect(bySlug.get("hops")?.items.map((item) => item.id)).toEqual(["hop-1"]);
    expect(bySlug.get("yeast")?.items.map((item) => item.id)).toEqual(["yeast-1"]);
    expect(bySlug.get("water")?.items.map((item) => item.id)).toEqual(["wt-1"]);
    expect(bySlug.get("additives")?.items.map((item) => item.id)).toEqual(["additive-1"]);
    expect(bySlug.get("consumables")?.items.map((item) => item.id)).toEqual(["cons-1"]);
    expect(result.sections.every((section) => section.total === 1)).toBe(true);
    expect(result.total).toBe(7);
  });

  it("делит fermentable по subtype: malt и fermentable — разные секции, не смешиваются", async () => {
    mockState.catalogItems = [
      buildCatalogItem({ id: "malt-a", type: "malt", subtype: "malt", itemKind: "malt", primaryLabelRu: "А-солод", displayName: "А-солод" }),
      buildCatalogItem({ id: "malt-b", type: "malt", subtype: "malt", itemKind: "malt", primaryLabelRu: "Б-солод", displayName: "Б-солод" }),
      buildCatalogItem({ id: "sugar-a", type: "fermentable", subtype: "fermentable", itemKind: "sugar", primaryLabelRu: "Декстроза", displayName: "Декстроза" })
    ];

    const result = await listCatalogHubSections(null, {});
    const bySlug = new Map(result.sections.map((section) => [section.slug, section]));

    expect(bySlug.get("malts")?.items.map((item) => item.id)).toEqual(["malt-a", "malt-b"]);
    expect(bySlug.get("malts")?.total).toBe(2);
    expect(bySlug.get("fermentables")?.items.map((item) => item.id)).toEqual(["sugar-a"]);
    expect(bySlug.get("fermentables")?.total).toBe(1);
  });

  it("делит consumable по broad group: «Специи и добавки» и «Расходники» — разные секции", async () => {
    mockState.catalogItems = [
      buildCatalogItem({ id: "spice-a", type: "consumable", category: "consumable", subtype: null, itemKind: "spice", primaryLabelRu: "Кориандр", displayName: "Кориандр" }),
      buildCatalogItem({ id: "sanitizer-a", type: "consumable", category: "consumable", subtype: null, itemKind: "sanitizer", primaryLabelRu: "Стар Сан", displayName: "Стар Сан" }),
      buildCatalogItem({ id: "cleaner-a", type: "consumable", category: "consumable", subtype: null, itemKind: "cleaner", primaryLabelRu: "PBW", displayName: "PBW" })
    ];

    const result = await listCatalogHubSections(null, {});
    const bySlug = new Map(result.sections.map((section) => [section.slug, section]));

    expect(bySlug.get("additives")?.items.map((item) => item.id)).toEqual(["spice-a"]);
    expect(bySlug.get("additives")?.total).toBe(1);
    expect(bySlug.get("consumables")?.items.map((item) => item.id)).toEqual(["sanitizer-a", "cleaner-a"]);
    expect(bySlug.get("consumables")?.total).toBe(2);
  });

  it("превью секции усечено лимитом 6, total считает все позиции секции", async () => {
    expect(CATALOG_HUB_PREVIEW_LIMIT).toBe(6);

    mockState.catalogItems = Array.from({ length: 8 }, (_, index) => {
      const letter = String.fromCharCode("A".charCodeAt(0) + index);
      return buildCatalogItem({
        id: `hop-${letter}`,
        type: "hop",
        category: "hop",
        subtype: "hop",
        itemKind: "hop",
        primaryLabelRu: `${letter}-хмель`,
        displayName: `${letter}-хмель`
      });
    });

    const result = await listCatalogHubSections(null, {});
    const hops = result.sections.find((section) => section.slug === "hops");

    expect(hops?.total).toBe(8);
    expect(hops?.items).toHaveLength(6);
    expect(hops?.items.map((item) => item.id)).toEqual(["hop-A", "hop-B", "hop-C", "hop-D", "hop-E", "hop-F"]);
    expect(result.total).toBe(8);
  });
});

describe("listCatalogHubSections: сквозной поиск (q)", () => {
  it("группирует ранжированный список по секциям и режет fuzzy-шум глобально (сценарий «citra»)", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "citra-main",
        type: "hop",
        category: "hop",
        subtype: "hop",
        primaryLabelRu: "Citra",
        displayName: "Citra",
        displayNameRu: "Citra",
        displayNameEn: "Citra",
        nameRu: "Цитра",
        nameEn: "Citra",
        itemKind: "hop"
      }),
      buildCatalogItem({
        id: "citra-cryo",
        type: "hop",
        category: "hop",
        subtype: "hop",
        primaryLabelRu: "Citra Cryo",
        displayName: "Citra Cryo",
        displayNameRu: "Citra Cryo",
        displayNameEn: "Citra Cryo",
        nameRu: "Цитра Крио",
        nameEn: "Citra Cryo",
        itemKind: "hop"
      }),
      // «Экстра»/«Extra» — в пределах левенштейн-дистанции 2 от «citra», но не
      // пересекается по префиксу/подстроке: единственный путь совпадения — tier
      // 9 (fuzzy). При наличии сильных hop-совпадений должен быть отрезан
      // filterRankedCatalogNoise ГЛОБАЛЬНО (как в listUserCatalogIngredients),
      // а не только внутри своей секции.
      buildCatalogItem({
        id: "malt-noise-fuzzy",
        type: "fermentable",
        category: "fermentable",
        subtype: "malt",
        primaryLabelRu: "Экстра",
        displayName: "Extra",
        displayNameRu: "Extra",
        displayNameEn: "Extra",
        nameRu: "Экстра",
        nameEn: "Extra",
        itemKind: "malt"
      })
    ];

    const result = await listCatalogHubSections(null, { q: "citra" });

    expect(result.sections[0].slug).toBe("hops");
    expect(result.sections[0].items.map((item) => item.id)).toEqual(["citra-main", "citra-cryo"]);
    expect(result.sections[0].total).toBe(2);

    const malts = result.sections.find((section) => section.slug === "malts");
    expect(malts?.total).toBe(0);
    expect(malts?.items).toEqual([]);
    expect(result.total).toBe(2);

    // Хвост секций без совпадений — в каноническом порядке (malts перед
    // fermentables и т.д., за вычетом уже подставленной вперёд hops).
    expect(result.sections.map((section) => section.slug)).toEqual([
      "hops", "malts", "fermentables", "yeast", "water", "additives", "consumables"
    ]);
  });

  it("порядок секций — по первому вхождению в ранжированном списке, а не канонический", async () => {
    // "flexo" — совпадает у дрожжевой позиции как prefix (tier 1), у хмелевой —
    // только через алиас-подстроку (tier 3). tier 1 < tier 3, поэтому дрожжи
    // должны оказаться первой секцией, хотя канонически идут после хмеля.
    mockState.catalogItems = [
      buildCatalogItem({
        id: "hop-weak-match",
        type: "hop",
        category: "hop",
        subtype: "hop",
        primaryLabelRu: "Загадочный хмель",
        displayName: "Mystery Hop",
        displayNameRu: "Загадочный хмель",
        displayNameEn: "Mystery Hop",
        nameRu: "Загадочный хмель",
        nameEn: "Mystery Hop",
        itemKind: "hop",
        aliases: [{
          id: "alias-1",
          locale: "en",
          alias: "Contains flexo term inline",
          aliasNormalized: normalizeSearchText("Contains flexo term inline"),
          source: "seed",
          isEnabled: true
        }]
      }),
      buildCatalogItem({
        id: "yeast-strong-match",
        type: "yeast",
        category: "yeast",
        subtype: "yeast",
        primaryLabelRu: "Flexo Ale Yeast",
        displayName: "Flexo Ale Yeast",
        displayNameRu: "Flexo Ale Yeast",
        displayNameEn: "Flexo Ale Yeast",
        nameRu: "Flexo Ale Yeast",
        nameEn: "Flexo Ale Yeast",
        itemKind: "yeast"
      })
    ];

    const result = await listCatalogHubSections(null, { q: "flexo" });

    expect(result.sections.map((section) => section.slug)).toEqual([
      "yeast", "hops", "malts", "fermentables", "water", "additives", "consumables"
    ]);
    expect(result.sections[0].items.map((item) => item.id)).toEqual(["yeast-strong-match"]);
    expect(result.sections[1].items.map((item) => item.id)).toEqual(["hop-weak-match"]);
  });

  it("превью секции при q усекается лимитом 10, total считает все совпадения секции", async () => {
    expect(CATALOG_HUB_SEARCH_GROUP_LIMIT).toBe(10);

    mockState.catalogItems = Array.from({ length: 12 }, (_, index) => {
      const label = `Citra ${String(index + 1).padStart(2, "0")}`;
      return buildCatalogItem({
        id: `citra-${index + 1}`,
        type: "hop",
        category: "hop",
        subtype: "hop",
        primaryLabelRu: label,
        displayName: label,
        displayNameRu: label,
        displayNameEn: label,
        nameRu: label,
        nameEn: label,
        itemKind: "hop"
      });
    });

    const result = await listCatalogHubSections(null, { q: "citra" });
    const hops = result.sections.find((section) => section.slug === "hops");

    expect(hops?.total).toBe(12);
    expect(hops?.items).toHaveLength(10);
    expect(hops?.items.map((item) => item.id)).toEqual([
      "citra-1", "citra-2", "citra-3", "citra-4", "citra-5",
      "citra-6", "citra-7", "citra-8", "citra-9", "citra-10"
    ]);
  });
});

describe("listCatalogHubSections: view=mine", () => {
  it("оставляет в секциях только custom-позиции, но customCount/catalogCount считают всё", async () => {
    mockState.catalogItems = [
      buildCatalogItem({ id: "catalog-hop", type: "hop", category: "hop", subtype: "hop", itemKind: "hop", primaryLabelRu: "Каскад", displayName: "Каскад" })
    ];
    mockState.customItems = [
      buildCustomItem({
        id: "custom-malt",
        type: "fermentable",
        displayName: "Мой солод",
        properties: { category: "fermentable", subtype: "malt", nameEn: "My Malt", aliases: [] }
      }),
      buildCustomItem({
        id: "custom-hop",
        type: "hop",
        displayName: "Мой хмель",
        hopAlphaAcidPct: 8,
        fermentableExtractYieldPct: null,
        fermentableColorEbc: null,
        properties: { category: "hop", subtype: "hop", nameEn: "My Hop", aliases: [] }
      })
    ];

    const result = await listCatalogHubSections("user-1", { view: "mine" });
    const bySlug = new Map(result.sections.map((section) => [section.slug, section]));

    expect(bySlug.get("malts")?.items.map((item) => item.id)).toEqual(["custom-malt"]);
    expect(bySlug.get("hops")?.items.map((item) => item.id)).toEqual(["custom-hop"]);
    expect(bySlug.get("hops")?.items.every((item) => item.source === "custom")).toBe(true);
    expect(result.total).toBe(2);
    expect(result.facets.customCount).toBe(2);
    expect(result.facets.catalogCount).toBe(1);
    expect(result.facets.byCategory).toEqual({
      fermentable: 1,
      hop: 1,
      yeast: 0,
      consumable: 0,
      water_treatment: 0
    });
  });
});

describe("listCatalogHubSections: facets в той же форме, что у listUserCatalogIngredients", () => {
  it("byCategory/byFermentableSubtype/customCount/catalogCount совпадают на одних данных без q/фильтра", async () => {
    mockState.catalogItems = [
      buildCatalogItem({ id: "malt-1", type: "malt", subtype: "malt", itemKind: "malt", primaryLabelRu: "Солод", displayName: "Солод" }),
      buildCatalogItem({ id: "hop-1", type: "hop", category: "hop", subtype: "hop", itemKind: "hop", primaryLabelRu: "Каскад", displayName: "Каскад" })
    ];
    mockState.customItems = [
      buildCustomItem({
        id: "custom-yeast",
        type: "yeast",
        displayName: "Мои дрожжи",
        yeastAttenuationPct: 78,
        fermentableExtractYieldPct: null,
        fermentableColorEbc: null,
        properties: { category: "yeast", subtype: "yeast", nameEn: "My Yeast", aliases: [] }
      })
    ];

    const hubResult = await listCatalogHubSections(null, {});
    const listResult = await listUserCatalogIngredients(null, {});

    expect(hubResult.facets.byCategory).toEqual(listResult.facets.byCategory);
    expect(hubResult.facets.byFermentableSubtype).toEqual(listResult.facets.byFermentableSubtype);
    expect(hubResult.facets.byConsumableGroup).toEqual(listResult.facets.byConsumableGroup);
    expect(hubResult.facets.customCount).toBe(listResult.facets.customCount);
    expect(hubResult.facets.catalogCount).toBe(listResult.facets.catalogCount);
    expect(hubResult.facets).toHaveProperty("filteredByCategory");
  });
});

describe("listUserCatalogIngredients: consumableGroup", () => {
  it("фильтрует по broad group и считает byConsumableGroup независимо от текущего фильтра", async () => {
    mockState.catalogItems = [
      buildCatalogItem({ id: "spice-a", type: "consumable", category: "consumable", subtype: null, itemKind: "spice", primaryLabelRu: "Кориандр", displayName: "Кориандр" }),
      buildCatalogItem({ id: "spice-b", type: "consumable", category: "consumable", subtype: null, itemKind: "herb_flower", primaryLabelRu: "Хмель Цветочный", displayName: "Chamomile" }),
      buildCatalogItem({ id: "sanitizer-a", type: "consumable", category: "consumable", subtype: null, itemKind: "sanitizer", primaryLabelRu: "Стар Сан", displayName: "Star San" }),
      buildCatalogItem({ id: "hop-1", type: "hop", category: "hop", subtype: "hop", itemKind: "hop", primaryLabelRu: "Каскад", displayName: "Каскад" })
    ];

    const additivesResult = await listUserCatalogIngredients(null, {
      category: "consumable",
      consumableGroup: "inventory_additives"
    });
    const suppliesResult = await listUserCatalogIngredients(null, {
      category: "consumable",
      consumableGroup: "inventory_supplies"
    });

    expect(additivesResult.items.map((item) => item.id).sort()).toEqual(["spice-a", "spice-b"]);
    expect(suppliesResult.items.map((item) => item.id)).toEqual(["sanitizer-a"]);
    // byConsumableGroup считается по всему baseItems (без учёта текущего фильтра
    // category/consumableGroup), как byCategory/byFermentableSubtype.
    expect(additivesResult.facets.byConsumableGroup).toEqual({ additives: 2, supplies: 1 });
    expect(suppliesResult.facets.byConsumableGroup).toEqual({ additives: 2, supplies: 1 });
  });
});
