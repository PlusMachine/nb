import { beforeEach, describe, expect, it, vi } from "vitest";

const now = new Date("2026-03-27T10:00:00.000Z");

const mockState = vi.hoisted(() => ({
  rows: [] as any[]
}));

const buildIngredientRow = (overrides: Record<string, unknown> = {}) => ({
  id: "ingredient-1",
  type: "hop",
  nameRu: null,
  nameEn: "Saaz",
  displayModeRu: "source_first",
  displayNameOverrideRu: null,
  secondaryNameOverrideRu: null,
  hideSecondaryNameRu: false,
  isActive: true,
  countryCode: "CZ",
  countryName: "Czechia",
  brand: null,
  producer: "Bohemia Hop",
  productCode: null,
  groupName: null,
  category: null,
  subcategory: null,
  itemKind: "hop",
  presentOnBirrf: true,
  inventoryEnabled: true,
  attributes: { alpha_acid_pct_typical: 3.5, hop_form: "pellet" },
  quantityDefaults: null,
  createdAt: now,
  updatedAt: now,
  aliases: [] as any[],
  sources: [] as any[],
  packageVariants: [] as any[],
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

import { searchIngredientSuggestions } from "../features/ingredients/service";

describe("ingredient search service", () => {
  beforeEach(() => {
    mockState.rows = [];
  });

  it("returns prefix-matched hops with canonical labels", async () => {
    mockState.rows = [buildIngredientRow()];

    const items = await searchIngredientSuggestions({ q: "Saa", type: "hop", limit: 8 });

    expect(items[0]).toMatchObject({
      id: "ingredient-1",
      displayName: "Saaz",
      defaultUnit: "g",
      category: "hop",
      source: "catalog"
    });
    expect(items[0]?.subtitle).toContain("Bohemia Hop");
  });

  it("supports exact alias matches for russian malt queries", async () => {
    mockState.rows = [
      buildIngredientRow({
        id: "malt-pilsner",
        type: "malt",
        nameRu: "Пилснер солод",
        nameEn: "Pilsner Malt",
        displayModeRu: "localized_first",
        countryName: "Belgium",
        brand: "Castle",
        itemKind: "malt",
        attributes: { extract_pct_dry_basis: 81, color_lovibond: 1.7 },
        aliases: [{
          id: "alias-pilsner",
          ingredientId: "malt-pilsner",
          locale: "ru",
          alias: "Пильзнер",
          aliasNormalized: "пильзнер",
          source: "seed",
          isEnabled: true,
          createdAt: now,
          updatedAt: now
        }]
      })
    ];

    const items = await searchIngredientSuggestions({ q: "пильзнер", category: "fermentable", limit: 8 });

    expect(items[0]).toMatchObject({
      id: "malt-pilsner",
      displayName: "Пилснер солод"
    });
  });

  it("keeps brand-aware english queries on the correct fermentable", async () => {
    mockState.rows = [
      buildIngredientRow({
        id: "soufflet-pilsen",
        type: "malt",
        nameRu: "Soufflet Pilsen 2RP",
        nameEn: "Soufflet Pilsen 2RP",
        displayModeRu: "source_first",
        brand: "Soufflet",
        countryName: "France",
        itemKind: "malt",
        attributes: { extract_pct_dry_basis: 81, color_lovibond: 1.7 }
      }),
      buildIngredientRow({
        id: "castle-vienna",
        type: "malt",
        nameRu: "Castle Vienna",
        nameEn: "Castle Vienna",
        displayModeRu: "source_first",
        brand: "Castle",
        countryName: "Belgium",
        itemKind: "malt",
        attributes: { extract_pct_dry_basis: 80, color_lovibond: 4 }
      })
    ];

    const items = await searchIngredientSuggestions({ q: "soufflet pilsen", category: "fermentable", limit: 8 });

    expect(items[0]?.id).toBe("soufflet-pilsen");
    expect(items[0]?.displayName).toBe("Soufflet Pilsen 2RP");
  });

  it("matches mixed queries across brand and canonical ingredient name", async () => {
    mockState.rows = [
      buildIngredientRow({
        id: "kursk-pilsner",
        type: "malt",
        nameRu: "Пилснер",
        nameEn: "Pilsner Malt",
        displayModeRu: "localized_first",
        brand: "Курский солод",
        countryName: "Россия",
        itemKind: "malt",
        attributes: { extract_pct_dry_basis: 80, color_lovibond: 1.8 }
      }),
      buildIngredientRow({
        id: "kursk-vienna",
        type: "malt",
        nameRu: "Венский",
        nameEn: "Vienna Malt",
        displayModeRu: "localized_first",
        brand: "Курский солод",
        countryName: "Россия",
        itemKind: "malt",
        attributes: { extract_pct_dry_basis: 79, color_lovibond: 4 }
      })
    ];

    const items = await searchIngredientSuggestions({ q: "КУРСКИЙ ПИЛСНЕР", category: "fermentable", limit: 8 });

    expect(items[0]).toMatchObject({
      id: "kursk-pilsner",
      displayName: "Пилснер",
      matchType: "brand"
    });
  });

  it("keeps malt extracts in the fermentable subtype when mapping seeded catalog rows", async () => {
    mockState.rows = [
      buildIngredientRow({
        id: "bavarian-pilsner-extract",
        type: "fermentable",
        nameRu: "Баварский пилснер",
        nameEn: "Bavarian Pilsner",
        displayModeRu: "localized_first",
        producer: "Weyermann",
        countryName: "Germany",
        itemKind: "malt_extract",
        attributes: {
          extract_pct_dry_basis: 75,
          color_lovibond: 6.1,
          fermentability_class: "highly_fermentable"
        }
      })
    ];

    const items = await searchIngredientSuggestions({ q: "баварский", category: "fermentable", limit: 8 });

    expect(items[0]).toMatchObject({
      id: "bavarian-pilsner-extract",
      category: "fermentable",
      subtype: "fermentable"
    });
  });
});
