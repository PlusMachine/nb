import { beforeEach, describe, expect, it, vi } from "vitest";

const now = new Date("2026-03-27T10:00:00.000Z");

const mockState = vi.hoisted(() => ({
  rows: [] as any[]
}));

const buildIngredientRow = (overrides: Record<string, unknown> = {}) => ({
  id: "ingredient-1",
  type: "hop",
  nameRu: null,
  nameEn: "Cascade",
  displayModeRu: "source_first",
  displayNameOverrideRu: null,
  secondaryNameOverrideRu: null,
  hideSecondaryNameRu: false,
  isActive: true,
  countryCode: "US",
  countryName: "United States",
  brand: null,
  producer: null,
  productCode: null,
  groupName: null,
  category: null,
  subcategory: null,
  itemKind: "hop",
  presentOnBirrf: true,
  inventoryEnabled: true,
  attributes: {},
  quantityDefaults: null,
  createdAt: now,
  updatedAt: now,
  aliases: [] as Array<{
    id: string;
    ingredientId: string;
    locale: "ru" | "en" | "neutral";
    alias: string;
    aliasNormalized: string;
    source: string;
    isEnabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>,
  sources: [] as Array<{
    id: string;
    ingredientId: string;
    kind: string | null;
    label: string | null;
    url: string | null;
    sourceBasis: string | null;
    position: number;
    createdAt: Date;
    updatedAt: Date;
  }>,
  packageVariants: [] as Array<{
    id: string;
    ingredientId: string;
    brand: string | null;
    productNameEn: string | null;
    productNameRu: string | null;
    countryNameRu: string | null;
    packageAmount: number | null;
    packageUnit: string | null;
    stockContentAmount: number | null;
    stockContentUnit: string | null;
    sourceGroup: string | null;
    sourceUrl: string | null;
    isDefaultForStock: boolean;
    position: number;
    createdAt: Date;
    updatedAt: Date;
  }>,
  ...overrides
});

vi.mock("@nb/db", () => ({
  db: {
    query: {
      ingredients: {
        findMany: async () => mockState.rows
      },
      proposedIngredients: {
        findMany: async () => []
      }
    }
  },
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  inArray: (...args: unknown[]) => args,
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
  ingredientAliases: { ingredientId: "ingredientId" },
  ingredientPackageVariants: { ingredientId: "ingredientId" },
  ingredients: { id: "id", isActive: "isActive", type: "type" },
  ingredientSources: { ingredientId: "ingredientId" },
  proposedIngredients: { status: "status" },
  recipeIngredients: { ingredientCatalogItemId: "ingredientCatalogItemId" },
  userIngredients: { ingredientCatalogItemId: "ingredientCatalogItemId" }
}));

import { listCatalogIngredients, searchCatalogItems } from "../features/ingredients/service";

describe("ingredient service search", () => {
  beforeEach(() => {
    mockState.rows = [];
  });

  it("ranks exact hop name matches above nearby noise for saaz", async () => {
    mockState.rows = [
      buildIngredientRow({
        id: "hop-saaz",
        type: "hop",
        nameEn: "Saaz",
        itemKind: "hop",
        aliases: [{
          id: "alias-saaz",
          ingredientId: "hop-saaz",
          locale: "ru",
          alias: "Сааз",
          aliasNormalized: "сааз",
          source: "seed",
          isEnabled: true,
          createdAt: now,
          updatedAt: now
        }]
      }),
      buildIngredientRow({
        id: "hop-motueka",
        type: "hop",
        nameEn: "Motueka",
        itemKind: "hop",
        aliases: [{
          id: "alias-mot",
          ingredientId: "hop-motueka",
          locale: "en",
          alias: "B Saaz",
          aliasNormalized: "b saaz",
          source: "seed",
          isEnabled: true,
          createdAt: now,
          updatedAt: now
        }]
      })
    ];

    const items = await searchCatalogItems({ q: "saaz", type: "hop", limit: 8 });

    expect(items[0]?.id).toBe("hop-saaz");
    expect(items[0]?.displayName).toBe("Saaz");
    expect(items[0]?.matchType).toBe("name");
  });

  it("finds cascade by russian alias without synthetic search fields", async () => {
    mockState.rows = [
      buildIngredientRow({
        id: "hop-cascade",
        type: "hop",
        nameEn: "Cascade",
        itemKind: "hop",
        aliases: [{
          id: "alias-cascade-ru",
          ingredientId: "hop-cascade",
          locale: "ru",
          alias: "Каскад",
          aliasNormalized: "каскад",
          source: "seed",
          isEnabled: true,
          createdAt: now,
          updatedAt: now
        }]
      })
    ];

    const items = await searchCatalogItems({ q: "каскад", type: "hop", limit: 8 });

    expect(items[0]).toMatchObject({
      id: "hop-cascade",
      displayName: "Cascade",
      matchType: "alias",
      matchedAlias: "Каскад"
    });
  });

  it("finds nutrient items by localized canonical names", async () => {
    mockState.rows = [
      buildIngredientRow({
        id: "consumable-yeast-nutrient",
        type: "consumable",
        nameRu: "Комплексная подкормка дрожжей",
        nameEn: "Complex Yeast Nutrient",
        displayModeRu: "localized_first",
        itemKind: "nutrient",
        category: "nutrient",
        aliases: [{
          id: "alias-nutrient-ru",
          ingredientId: "consumable-yeast-nutrient",
          locale: "ru",
          alias: "Подкормка",
          aliasNormalized: "подкормка",
          source: "seed",
          isEnabled: true,
          createdAt: now,
          updatedAt: now
        }]
      })
    ];

    const items = await searchCatalogItems({ q: "подкормка", category: "consumable", limit: 8 });

    expect(items[0]?.id).toBe("consumable-yeast-nutrient");
    expect(items[0]?.displayName).toBe("Комплексная подкормка дрожжей");
    expect(items[0]?.matchType).toBe("alias");
  });

  it("returns canonical sanitizer with matched package variant for star san", async () => {
    mockState.rows = [
      buildIngredientRow({
        id: "acid-sanitizer",
        type: "consumable",
        nameRu: "Кислотный санитайзер",
        nameEn: "Acid Sanitizer",
        displayModeRu: "localized_first",
        itemKind: "sanitizer",
        category: "sanitizer",
        packageVariants: [{
          id: "pv-star-san-946",
          ingredientId: "acid-sanitizer",
          brand: "Five Star",
          productNameEn: "Star San",
          productNameRu: "Star San",
          countryNameRu: "USA",
          packageAmount: 946,
          packageUnit: "ml",
          stockContentAmount: 946,
          stockContentUnit: "ml",
          sourceGroup: null,
          sourceUrl: null,
          isDefaultForStock: true,
          position: 0,
          createdAt: now,
          updatedAt: now
        }]
      })
    ];

    const items = await searchCatalogItems({ q: "star san", category: "consumable", limit: 8 });

    expect(items[0]).toMatchObject({
      id: "acid-sanitizer",
      displayName: "Кислотный санитайзер",
      matchType: "package",
      matchedPackageVariantId: "pv-star-san-946",
      matchedPackageVariantName: "Five Star Star San"
    });
  });

  it("finds lactic acid by localized name", async () => {
    mockState.rows = [
      buildIngredientRow({
        id: "lactic-acid",
        type: "water_treatment",
        nameRu: "Молочная кислота",
        nameEn: "Lactic Acid",
        displayModeRu: "localized_first",
        itemKind: "acid",
        category: "acid",
        attributes: { unit_preferred: "ml" }
      })
    ];

    const items = await searchCatalogItems({ q: "молочная кислота", category: "water_treatment", limit: 8 });

    expect(items[0]).toMatchObject({
      id: "lactic-acid",
      displayName: "Молочная кислота",
      matchType: "name"
    });
  });

  it("prefers exact product code matches for yeasts", async () => {
    mockState.rows = [
      buildIngredientRow({
        id: "yeast-bf16",
        type: "yeast",
        nameRu: "BF16 Лагер",
        nameEn: "BF16 Lager",
        displayModeRu: "source_first",
        itemKind: "yeast",
        productCode: "BF16",
        brand: "BrewFerm",
        attributes: { form: "dry" }
      })
    ];

    const items = await searchCatalogItems({ q: "bf16", type: "yeast", limit: 8 });

    expect(items[0]).toMatchObject({
      id: "yeast-bf16",
      displayName: "BF16 Lager"
    });
  });

  it("returns canonical fining with matched package variant for whirlfloc", async () => {
    mockState.rows = [
      buildIngredientRow({
        id: "kettle-fining",
        type: "consumable",
        nameRu: "Котловой осветлитель",
        nameEn: "Kettle Fining",
        displayModeRu: "localized_first",
        itemKind: "fining",
        category: "fining",
        packageVariants: [{
          id: "pv-whirlfloc-20",
          ingredientId: "kettle-fining",
          brand: "BreakBrite",
          productNameEn: "Whirlfloc Tablets",
          productNameRu: "Whirlfloc Tablets",
          countryNameRu: "RU",
          packageAmount: 20,
          packageUnit: "item",
          stockContentAmount: 20,
          stockContentUnit: "item",
          sourceGroup: null,
          sourceUrl: null,
          isDefaultForStock: true,
          position: 0,
          createdAt: now,
          updatedAt: now
        }]
      })
    ];

    const items = await searchCatalogItems({ q: "whirlfloc", category: "consumable", limit: 8 });

    expect(items[0]).toMatchObject({
      id: "kettle-fining",
      matchType: "package",
      matchedPackageVariantId: "pv-whirlfloc-20",
      matchedPackageVariantName: "BreakBrite Whirlfloc Tablets"
    });
  });

  it("allows admin catalog search to rank more than autocomplete limit", async () => {
    mockState.rows = Array.from({ length: 30 }, (_, index) => buildIngredientRow({
      id: `ingredient-${index}`,
      type: "hop",
      nameEn: index === 25 ? "Saaz" : `Hop ${index}`,
      itemKind: "hop"
    }));

    const result = await listCatalogIngredients({
      q: "saaz",
      page: 1,
      pageSize: 100,
      sort: "brand"
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe("ingredient-25");
  });

  it("prioritizes consumable market names above abstract canonical labels for pbw", async () => {
    mockState.rows = [
      buildIngredientRow({
        id: "cleaner-pbw",
        type: "consumable",
        nameRu: "Щелочное порошковое моющее средство",
        nameEn: "Alkaline Brewery Cleaner Powder",
        displayModeRu: "localized_first",
        itemKind: "cleaner",
        category: "cleaner",
        attributes: {
          picker_group: "cleaner",
          market_names_ru: ["PBW"],
          market_names_en: ["PBW", "Powdered Brewery Wash"],
          search_priority_terms_ru: ["пбв", "pbw", "щелочная мойка"]
        },
        aliases: [{
          id: "alias-pbw-market",
          ingredientId: "cleaner-pbw",
          locale: "en",
          alias: "PBW",
          aliasNormalized: "pbw",
          source: "seed_market_name",
          isEnabled: true,
          createdAt: now,
          updatedAt: now
        }]
      }),
      buildIngredientRow({
        id: "cleaner-generic",
        type: "consumable",
        nameRu: "Щелочное моющее средство",
        nameEn: "Alkaline Cleaner",
        displayModeRu: "localized_first",
        itemKind: "cleaner",
        category: "cleaner"
      })
    ];

    const items = await searchCatalogItems({ q: "pbw", category: "consumable", limit: 8 });

    expect(items[0]).toMatchObject({
      id: "cleaner-pbw",
      matchType: "alias",
      matchedAlias: "PBW"
    });
  });

  it("matches functional consumable queries through priority terms", async () => {
    mockState.rows = [
      buildIngredientRow({
        id: "sanitizer-acid",
        type: "consumable",
        nameRu: "Санитайзер без смывания",
        nameEn: "No-Rinse Sanitizer",
        displayModeRu: "localized_first",
        itemKind: "sanitizer",
        category: "sanitizer",
        attributes: {
          picker_group: "sanitizer",
          search_priority_terms_ru: ["санитайзер", "санитайзер без смывания"]
        },
        aliases: [{
          id: "alias-sanitizer-priority",
          ingredientId: "sanitizer-acid",
          locale: "ru",
          alias: "санитайзер",
          aliasNormalized: "санитайзер",
          source: "seed_priority_term",
          isEnabled: true,
          createdAt: now,
          updatedAt: now
        }]
      }),
      buildIngredientRow({
        id: "fining-kettle",
        type: "consumable",
        nameRu: "Котловой осветлитель",
        nameEn: "Kettle Fining",
        displayModeRu: "localized_first",
        itemKind: "fining",
        category: "fining",
        attributes: {
          picker_group: "fining",
          search_priority_terms_ru: ["осветлитель"]
        },
        aliases: [{
          id: "alias-fining-priority",
          ingredientId: "fining-kettle",
          locale: "ru",
          alias: "осветлитель",
          aliasNormalized: "осветлитель",
          source: "seed_priority_term",
          isEnabled: true,
          createdAt: now,
          updatedAt: now
        }]
      })
    ];

    const sanitizerResults = await searchCatalogItems({ q: "санитайзер", category: "consumable", limit: 8 });
    const finingResults = await searchCatalogItems({ q: "осветлитель", category: "consumable", limit: 8 });

    expect(sanitizerResults[0]).toMatchObject({
      id: "sanitizer-acid",
      matchType: "alias",
      matchedAlias: "санитайзер"
    });
    expect(finingResults[0]).toMatchObject({
      id: "fining-kettle",
      matchType: "alias",
      matchedAlias: "осветлитель"
    });
  });
});
