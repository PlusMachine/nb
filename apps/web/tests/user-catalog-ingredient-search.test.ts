import { beforeEach, describe, expect, it, vi } from "vitest";

const now = new Date("2026-03-27T10:00:00.000Z");

const mockState = vi.hoisted(() => ({
  catalogItems: [] as any[]
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
  brand: "Castle Malting",
  producer: "Castle Malting",
  brandName: "Castle Malting",
  manufacturer: "Castle Malting",
  country: "Belgium",
  countryCode: "BE",
  countryName: "Belgium",
  productCode: null,
  groupName: null,
  sourceCategory: null,
  subcategory: null,
  itemKind: "malt",
  presentOnBirrf: true,
  isActive: true,
  inventoryEnabled: true,
  attributes: {},
  technicalData: {
    type: "malt",
    extractPctDryBasis: 81,
    colorLovibond: 1.6
  },
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
  getIngredientById: async () => null
}));

vi.mock("@nb/db", () => ({
  db: {
    query: {
      userCustomIngredients: {
        findMany: async () => []
      }
    }
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

import { searchUserCatalogIngredients } from "../features/ingredients/catalog-service";

describe("user catalog ingredient search", () => {
  beforeEach(() => {
    mockState.catalogItems = [];
  });

  it("returns manufacturer refinements for broad type-first queries", async () => {
    mockState.catalogItems = [
      buildCatalogItem({ id: "castle-pils-1", primaryLabelRu: "Castle Pilsner 2RS", displayName: "Castle Pilsner 2RS", nameRu: "Castle Pilsner 2RS", brand: "Castle Malting", producer: "Castle Malting", brandName: "Castle Malting", manufacturer: "Castle Malting" }),
      buildCatalogItem({ id: "castle-pils-2", primaryLabelRu: "Castle Pilsner 3RS", displayName: "Castle Pilsner 3RS", nameRu: "Castle Pilsner 3RS", brand: "Castle Malting", producer: "Castle Malting", brandName: "Castle Malting", manufacturer: "Castle Malting" }),
      buildCatalogItem({ id: "castle-pils-3", primaryLabelRu: "Castle Pils", displayName: "Castle Pils", nameRu: "Castle Pils", brand: "Castle Malting", producer: "Castle Malting", brandName: "Castle Malting", manufacturer: "Castle Malting" }),
      buildCatalogItem({ id: "castle-pils-4", primaryLabelRu: "Castle Pilsen", displayName: "Castle Pilsen", nameRu: "Castle Pilsen", brand: "Castle Malting", producer: "Castle Malting", brandName: "Castle Malting", manufacturer: "Castle Malting" }),
      buildCatalogItem({ id: "castle-pils-5", primaryLabelRu: "Castle Organic Pilsner", displayName: "Castle Organic Pilsner", nameRu: "Castle Organic Pilsner", brand: "Castle Malting", producer: "Castle Malting", brandName: "Castle Malting", manufacturer: "Castle Malting" }),
      buildCatalogItem({ id: "weyermann-pils-1", primaryLabelRu: "Weyermann Pilsner", displayName: "Weyermann Pilsner", nameRu: "Weyermann Pilsner", brand: "Weyermann", producer: "Weyermann", brandName: "Weyermann", manufacturer: "Weyermann", countryCode: "DE", countryName: "Germany", country: "Germany" }),
      buildCatalogItem({ id: "weyermann-pils-2", primaryLabelRu: "Weyermann Floor-Malted Pilsner", displayName: "Weyermann Floor-Malted Pilsner", nameRu: "Weyermann Floor-Malted Pilsner", brand: "Weyermann", producer: "Weyermann", brandName: "Weyermann", manufacturer: "Weyermann", countryCode: "DE", countryName: "Germany", country: "Germany" }),
      buildCatalogItem({ id: "weyermann-pils-3", primaryLabelRu: "Weyermann Bohemian Pilsner", displayName: "Weyermann Bohemian Pilsner", nameRu: "Weyermann Bohemian Pilsner", brand: "Weyermann", producer: "Weyermann", brandName: "Weyermann", manufacturer: "Weyermann", countryCode: "DE", countryName: "Germany", country: "Germany" }),
      buildCatalogItem({ id: "weyermann-pils-4", primaryLabelRu: "Weyermann Extra Pils", displayName: "Weyermann Extra Pils", nameRu: "Weyermann Extra Pils", brand: "Weyermann", producer: "Weyermann", brandName: "Weyermann", manufacturer: "Weyermann", countryCode: "DE", countryName: "Germany", country: "Germany" }),
      buildCatalogItem({ id: "soufflet-pils-1", primaryLabelRu: "Soufflet Pilsen 2RP", displayName: "Soufflet Pilsen 2RP", nameRu: "Soufflet Pilsen 2RP", brand: "Soufflet", producer: "Soufflet", brandName: "Soufflet", manufacturer: "Soufflet", countryCode: "FR", countryName: "France", country: "France" }),
      buildCatalogItem({ id: "soufflet-pils-2", primaryLabelRu: "Soufflet Premium Pils", displayName: "Soufflet Premium Pils", nameRu: "Soufflet Premium Pils", brand: "Soufflet", producer: "Soufflet", brandName: "Soufflet", manufacturer: "Soufflet", countryCode: "FR", countryName: "France", country: "France" })
    ];

    const result = await searchUserCatalogIngredients("user-1", {
      q: "pils",
      category: "fermentable",
      subtype: "malt",
      limit: 10
    });

    expect(result.total).toBe(11);
    expect(result.items).toHaveLength(10);
    expect(result.isBroadMatch).toBe(true);
    expect(result.hasMore).toBe(true);
    expect(result.refinements.slice(0, 3)).toMatchObject([
      { label: "Castle Malting", count: 5 },
      { label: "Weyermann", count: 4 },
      { label: "Soufflet", count: 2 }
    ]);
  });

  it("surfaces a manufacturer refinement for broad brand-first queries", async () => {
    mockState.catalogItems = Array.from({ length: 11 }, (_, index) => buildCatalogItem({
      id: `castle-item-${index + 1}`,
      primaryLabelRu: `Castle Malt ${index + 1}`,
      displayName: `Castle Malt ${index + 1}`,
      nameRu: `Castle Malt ${index + 1}`,
      brand: "Castle Malting",
      producer: "Castle Malting",
      brandName: "Castle Malting",
      manufacturer: "Castle Malting"
    }));

    const result = await searchUserCatalogIngredients("user-1", {
      q: "cas",
      category: "fermentable",
      subtype: "malt",
      limit: 10
    });

    expect(result.total).toBe(11);
    expect(result.isBroadMatch).toBe(true);
    expect(result.refinements[0]).toMatchObject({
      label: "Castle Malting",
      count: 11
    });
  });

  it("scopes results to the selected manufacturer without dropping the query", async () => {
    mockState.catalogItems = [
      buildCatalogItem({ id: "castle-pilsner-2rs", primaryLabelRu: "Pilsner 2RS", displayName: "Pilsner 2RS", nameRu: "Pilsner 2RS", brand: "Castle Malting", producer: "Castle Malting", brandName: "Castle Malting", manufacturer: "Castle Malting" }),
      buildCatalogItem({ id: "castle-pilsner-3rs", primaryLabelRu: "Pilsner 3RS", displayName: "Pilsner 3RS", nameRu: "Pilsner 3RS", brand: "Castle Malting", producer: "Castle Malting", brandName: "Castle Malting", manufacturer: "Castle Malting" }),
      buildCatalogItem({
        id: "castle-vienna",
        primaryLabelRu: "Vienna",
        secondaryLabelRu: "Vienna Malt",
        displayName: "Vienna",
        displayNameRu: "Vienna",
        displayNameEn: "Vienna Malt",
        nameRu: "Vienna",
        nameEn: "Vienna Malt",
        brand: "Castle Malting",
        producer: "Castle Malting",
        brandName: "Castle Malting",
        manufacturer: "Castle Malting"
      }),
      buildCatalogItem({ id: "weyermann-pilsner", primaryLabelRu: "Pilsner", displayName: "Pilsner", nameRu: "Pilsner", brand: "Weyermann", producer: "Weyermann", brandName: "Weyermann", manufacturer: "Weyermann", countryCode: "DE", countryName: "Germany", country: "Germany" })
    ];

    const result = await searchUserCatalogIngredients("user-1", {
      q: "pils",
      category: "fermentable",
      subtype: "malt",
      manufacturer: "Castle Malting",
      limit: 10
    });

    expect(result.total).toBe(2);
    expect(result.isBroadMatch).toBe(false);
    expect(result.refinements).toEqual([]);
    expect(result.appliedManufacturer).toMatchObject({
      label: "Castle Malting",
      normalizedLabel: "castle malting"
    });
    expect(result.items.map((item) => item.id)).toEqual([
      "castle-pilsner-2rs",
      "castle-pilsner-3rs"
    ]);
    expect(result.items.every((item) => item.brand === "Castle Malting")).toBe(true);
  });
});
