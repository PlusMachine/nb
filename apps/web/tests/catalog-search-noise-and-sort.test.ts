import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CATALOG_SEARCH_NOISE_TIER_MIN,
  CATALOG_SEARCH_STRONG_TIER_MAX,
  filterRankedCatalogNoise
} from "../features/ingredients/catalog-ranking";

// Часть 1: чистый юнит-тест filterRankedCatalogNoise (без БД/сервисов).
describe("filterRankedCatalogNoise", () => {
  const strongItem = { id: "strong", tier: 0 };
  const noiseTokenScatterItem = { id: "noise-token", tier: CATALOG_SEARCH_NOISE_TIER_MIN };
  const noiseFuzzyItem = { id: "noise-fuzzy", tier: 9 };

  it("режет token-scatter/fuzzy хвост, когда есть хотя бы одно сильное совпадение", () => {
    const result = filterRankedCatalogNoise([strongItem, noiseTokenScatterItem, noiseFuzzyItem]);

    expect(result.map((item) => item.id)).toEqual(["strong"]);
  });

  it("оставляет хвост как fallback «возможно, вы имели в виду», если сильных совпадений нет", () => {
    const result = filterRankedCatalogNoise([noiseTokenScatterItem, noiseFuzzyItem]);

    expect(result.map((item) => item.id)).toEqual(["noise-token", "noise-fuzzy"]);
  });

  it("не трогает пустой список", () => {
    expect(filterRankedCatalogNoise([])).toEqual([]);
  });

  it("держит границу ровно на CATALOG_SEARCH_STRONG_TIER_MAX (7 — ещё сильное, 8 — уже шум)", () => {
    const boundaryStrong = { id: "boundary-strong", tier: CATALOG_SEARCH_STRONG_TIER_MAX };
    const boundaryNoise = { id: "boundary-noise", tier: CATALOG_SEARCH_STRONG_TIER_MAX + 1 };

    const result = filterRankedCatalogNoise([boundaryStrong, boundaryNoise]);

    expect(result.map((item) => item.id)).toEqual(["boundary-strong"]);
  });
});

// Часть 2: интеграционные кейсы через сервис-слой (мокаем ./service и БД,
// как в user-catalog-ingredient-search.test.ts — реальный ranking.ts не мокается).
const now = new Date("2026-03-27T10:00:00.000Z");

const mockState = vi.hoisted(() => ({
  catalogItems: [] as any[],
  customItems: [] as any[],
  favoriteKeys: new Set<string>()
}));

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
  listUserCatalogIngredients,
  searchUserCatalogIngredients
} from "../features/ingredients/catalog-service";

describe("каталог: обрезка шумного хвоста поиска (2.1)", () => {
  beforeEach(() => {
    mockState.catalogItems = [];
    mockState.customItems = [];
    mockState.favoriteKeys = new Set();
  });

  it("«citra» не тянет fuzzy-шум (не hop-товар за границей edit-дистанции), когда есть точные совпадения", async () => {
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
      // Шум: «Extra» находится в пределах левенштейн-дистанции 2 от «citra»
      // (c-i-t-r-a → e-x-t-r-a), но не пересекается по префиксу/подстроке —
      // единственный путь совпадения для него — tier 9 (fuzzy).
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

    const result = await listUserCatalogIngredients(null, { q: "citra" });

    expect(result.items.map((item) => item.id)).toEqual(["citra-main", "citra-cryo"]);
    expect(result.items.some((item) => item.id === "malt-noise-fuzzy")).toBe(false);
    expect(result.total).toBe(2);
  });

  it("опечатка без сильных совпадений возвращает fuzzy-fallback («возможно, вы имели в виду»)", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "citra-only",
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
      // Полностью нерелевантный товар — buildRankedItem должен отбросить его
      // как null (score <= 0), а не за счёт нашего фильтра шума.
      buildCatalogItem({
        id: "unrelated",
        type: "fermentable",
        category: "fermentable",
        subtype: "malt",
        primaryLabelRu: "Пилснер",
        displayName: "Pilsner",
        displayNameRu: "Пилснер",
        displayNameEn: "Pilsner",
        nameRu: "Пилснер",
        nameEn: "Pilsner",
        itemKind: "malt"
      })
    ];

    // «citta» — опечатка на 1 правку от «citra» (r → t), не является ни
    // префиксом, ни подстрокой «citra» — совпадает только через fuzzy (tier 9).
    const result = await listUserCatalogIngredients(null, { q: "citta" });

    expect(result.items.map((item) => item.id)).toEqual(["citra-only"]);
  });

  it("поиск по бренду продолжает работать (tier 7 — граница «сильного», не режется)", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "weyermann-brand-only",
        primaryLabelRu: "Особый солод",
        displayName: "Special Malt",
        displayNameRu: "Особый солод",
        displayNameEn: "Special Malt",
        nameRu: "Особый солод",
        nameEn: "Special Malt",
        brand: "Weyermann",
        producer: "Weyermann",
        brandName: "Weyermann",
        manufacturer: "Weyermann"
      }),
      buildCatalogItem({
        id: "other-brand",
        primaryLabelRu: "Другой солод",
        displayName: "Other Malt",
        displayNameRu: "Другой солод",
        displayNameEn: "Other Malt",
        nameRu: "Другой солод",
        nameEn: "Other Malt",
        brand: "BESTMALZ",
        producer: "BESTMALZ",
        brandName: "BESTMALZ",
        manufacturer: "BESTMALZ"
      })
    ];

    const result = await listUserCatalogIngredients(null, { q: "weyermann" });

    expect(result.items.map((item) => item.id)).toEqual(["weyermann-brand-only"]);
  });

  it("поиск по коду (wlp002) продолжает работать", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "wlp002-yeast",
        type: "yeast",
        category: "yeast",
        subtype: "yeast",
        primaryLabelRu: "English Ale Yeast",
        displayName: "WLP002",
        displayNameRu: "English Ale Yeast",
        displayNameEn: "WLP002",
        nameRu: "English Ale Yeast",
        nameEn: "WLP002",
        productCode: "WLP002",
        itemKind: "yeast"
      }),
      buildCatalogItem({
        id: "other-yeast",
        type: "yeast",
        category: "yeast",
        subtype: "yeast",
        primaryLabelRu: "US-05",
        displayName: "US-05",
        displayNameRu: "US-05",
        displayNameEn: "US-05",
        nameRu: "US-05",
        nameEn: "US-05",
        productCode: "US-05",
        itemKind: "yeast"
      })
    ];

    const result = await listUserCatalogIngredients(null, { q: "wlp002" });

    expect(result.items.map((item) => item.id)).toEqual(["wlp002-yeast"]);
  });

  // Решение (см. decisions в отчёте задачи): в searchUserCatalogIngredients
  // (пикеры) обрезка НЕ применяется — в отличие от listUserCatalogIngredients
  // (страница каталога). Для части расходников единственный способ найти товар
  // по маркетинговому/приоритетному термину — как раз tier 8 (token-scatter) в
  // buildFallbackRank, и существующий тест "uses manufacturer refinements as a
  // secondary layer inside a selected consumable group" на это опирается.
  // Тест ниже фиксирует эту намеренную асимметрию на нашей же fixture.
  it("searchUserCatalogIngredients (пикеры) намеренно не режет шумный хвост — асимметрия с listUserCatalogIngredients", async () => {
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

    const result = await searchUserCatalogIngredients("user-1", { q: "citra", limit: 10 });

    expect(result.items.map((item) => item.id)).toEqual(["citra-main", "malt-noise-fuzzy"]);
    expect(result.total).toBe(2);
  });
});

describe("каталог: параметрические сортировки (3.5)", () => {
  beforeEach(() => {
    mockState.catalogItems = [];
    mockState.customItems = [];
    mockState.favoriteKeys = new Set();
  });

  it("sort=alpha сортирует хмель по альфа-кислоте по возрастанию, товары без значения — в конце", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "hop-high",
        type: "hop",
        category: "hop",
        subtype: "hop",
        primaryLabelRu: "Б-хмель",
        displayName: "Б-хмель",
        hopAlphaAcidPct: 12
      }),
      buildCatalogItem({
        id: "hop-low",
        type: "hop",
        category: "hop",
        subtype: "hop",
        primaryLabelRu: "А-хмель",
        displayName: "А-хмель",
        hopAlphaAcidPct: 4
      }),
      buildCatalogItem({
        id: "hop-unknown",
        type: "hop",
        category: "hop",
        subtype: "hop",
        primaryLabelRu: "В-хмель",
        displayName: "В-хмель",
        hopAlphaAcidPct: null
      })
    ];

    const result = await listUserCatalogIngredients(null, { category: "hop", sort: "alpha" });

    expect(result.items.map((item) => item.id)).toEqual(["hop-low", "hop-high", "hop-unknown"]);
  });

  it("sort=color сортирует по EBC через resolveIngredientTechnicalDataColorRangeEbc, с фолбэком на fermentableColorLovibond*1.97", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "malt-dark",
        primaryLabelRu: "Тёмный солод",
        displayName: "Тёмный солод",
        technicalData: { type: "malt", colorEbcMin: 40, colorEbcMax: 60 }
      }),
      buildCatalogItem({
        id: "malt-light",
        primaryLabelRu: "Светлый солод",
        displayName: "Светлый солод",
        technicalData: { type: "malt", colorEbcMin: 3, colorEbcMax: 4 }
      }),
      // technicalData отсутствует — сортировка обязана упасть на фолбэк
      // fermentableColorLovibond * 1.97 (поле лежит прямо в DTO).
      buildCatalogItem({
        id: "malt-fallback-lovibond",
        primaryLabelRu: "Солод по фолбэку",
        displayName: "Солод по фолбэку",
        technicalData: null,
        fermentableColorLovibond: 10
      }),
      buildCatalogItem({
        id: "malt-unknown",
        primaryLabelRu: "Неизвестный солод",
        displayName: "Неизвестный солод",
        technicalData: null
      })
    ];

    const result = await listUserCatalogIngredients(null, { category: "fermentable", sort: "color" });

    // malt-light (avg EBC 3.5) < malt-fallback-lovibond (10 * 1.97 = 19.7) < malt-dark (avg EBC 50) < unknown
    expect(result.items.map((item) => item.id)).toEqual([
      "malt-light",
      "malt-fallback-lovibond",
      "malt-dark",
      "malt-unknown"
    ]);
  });

  it("sort=attenuation сортирует дрожжи по аттенюации по возрастанию, без значения — в конце", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "yeast-high",
        type: "yeast",
        category: "yeast",
        subtype: "yeast",
        primaryLabelRu: "Б-дрожжи",
        displayName: "Б-дрожжи",
        yeastAttenuationPct: 85
      }),
      buildCatalogItem({
        id: "yeast-low",
        type: "yeast",
        category: "yeast",
        subtype: "yeast",
        primaryLabelRu: "А-дрожжи",
        displayName: "А-дрожжи",
        yeastAttenuationPct: 68
      }),
      buildCatalogItem({
        id: "yeast-unknown",
        type: "yeast",
        category: "yeast",
        subtype: "yeast",
        primaryLabelRu: "В-дрожжи",
        displayName: "В-дрожжи",
        yeastAttenuationPct: null
      })
    ];

    const result = await listUserCatalogIngredients(null, { category: "yeast", sort: "attenuation" });

    expect(result.items.map((item) => item.id)).toEqual(["yeast-low", "yeast-high", "yeast-unknown"]);
  });

  it("семантическая валидация: sort=alpha при неподходящей категории трактуется как name", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "ferm-b",
        primaryLabelRu: "Б-сырьё",
        displayName: "Б-сырьё",
        hopAlphaAcidPct: 4
      }),
      buildCatalogItem({
        id: "ferm-a",
        primaryLabelRu: "А-сырьё",
        displayName: "А-сырьё",
        hopAlphaAcidPct: 12
      })
    ];

    // category="fermentable", а не "hop" — sort=alpha семантически не подходит.
    const result = await listUserCatalogIngredients(null, { category: "fermentable", sort: "alpha" });

    expect(result.items.map((item) => item.id)).toEqual(["ferm-a", "ferm-b"]);
  });

  it("семантическая валидация: sort=color/attenuation без активной категории трактуется как name", async () => {
    mockState.catalogItems = [
      buildCatalogItem({ id: "b-item", primaryLabelRu: "Б-товар", displayName: "Б-товар" }),
      buildCatalogItem({ id: "a-item", primaryLabelRu: "А-товар", displayName: "А-товар" })
    ];

    const colorResult = await listUserCatalogIngredients(null, { sort: "color" });
    const attenuationResult = await listUserCatalogIngredients(null, { sort: "attenuation" });

    expect(colorResult.items.map((item) => item.id)).toEqual(["a-item", "b-item"]);
    expect(attenuationResult.items.map((item) => item.id)).toEqual(["a-item", "b-item"]);
  });
});
