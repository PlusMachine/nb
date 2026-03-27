import { beforeEach, describe, expect, it, vi } from "vitest";

const buildHopRow = (overrides: Record<string, unknown> = {}) => ({
  id: "hop-1",
  type: "hop",
  category: "hop",
  subtype: "pellet",
  familyId: "fam-hop",
  familyCanonicalName: "Saaz",
  familyDisplayNameEn: "Saaz",
  familyDisplayNameRu: "Сааз",
  displayName: "Saaz",
  displayNameRu: "Saaz",
  displayNameEn: "Saaz",
  brandName: null,
  manufacturer: "Bohemia Hop",
  country: "Чехия",
  harvestYear: 2024,
  defaultUnit: "g",
  defaultDisplayUnit: "g",
  allowedUnits: ["g", "kg", "oz", "lb"],
  measurementDimension: "weight",
  completenessLevel: "recommended",
  technicalData: {
    category: "hop",
    subtype: "pellet",
    alphaAcidPct: 3.5,
    betaAcidPct: null,
    totalOilMlPer100g: null,
    notes: null,
    harvestYear: 2024
  },
  normalizedName: "saaz",
  aliases: ["Saaz"],
  searchAliasesNorm: ["saaz", "сааз"],
  searchTextNorm: "saaz сааз bohemia hop чехия",
  score: 0,
  ...overrides
});

const buildFermentableRow = (overrides: Record<string, unknown> = {}) => ({
  id: "ferm-1",
  type: "fermentable",
  category: "fermentable",
  subtype: "base_malt",
  familyId: "fam-fermentable",
  familyCanonicalName: "Pilsner",
  familyDisplayNameEn: "Pilsner",
  familyDisplayNameRu: "Пилснер",
  displayName: "Castle Pilsner",
  displayNameRu: "Castle Pilsner",
  displayNameEn: "Castle Pilsner",
  brandName: "Castle",
  manufacturer: "Castle Malting",
  country: "Бельгия",
  harvestYear: null,
  defaultUnit: "kg",
  defaultDisplayUnit: "kg",
  allowedUnits: ["g", "kg", "oz", "lb"],
  measurementDimension: "weight",
  completenessLevel: "recommended",
  technicalData: {
    category: "fermentable",
    subtype: "base_malt",
    colorEbc: 3.4,
    extractYieldPct: 81,
    proteinPct: null,
    moisturePct: null,
    maxUsagePercent: null,
    diastaticPowerLintner: null,
    usageFlags: []
  },
  normalizedName: "castle pilsner",
  aliases: ["Castle Pilsner", "castle pilsner", "pilsner"],
  searchAliasesNorm: ["castle pilsner", "castle pilsen", "pilsner", "pilsener", "pilsen", "пилснер", "пильзнер", "пилсен"],
  searchTextNorm: "castle pilsner castle pilsen pilsner pilsener pilsen пилснер пильзнер пилсен castle malting бельгия",
  score: 0,
  ...overrides
});

const mockState = vi.hoisted(() => ({
  limitCalls: 0,
  rows: [] as Array<Record<string, unknown>>
}));

vi.mock("@nb/db", () => {
  const queryChain = {
    from: () => ({
      leftJoin: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => {
              mockState.limitCalls += 1;
              if (mockState.limitCalls === 1) {
                const error = new Error("function similarity(text, text) does not exist") as Error & { code?: string };
                error.code = "42883";
                throw error;
              }

              return mockState.rows;
            }
          })
        })
      })
    })
  };

  return {
    db: {
      select: () => queryChain
    },
    and: (...args: unknown[]) => args,
    asc: (value: unknown) => value,
    desc: (value: unknown) => value,
    eq: (...args: unknown[]) => args,
    ilike: (...args: unknown[]) => args,
    inArray: (...args: unknown[]) => args,
    or: (...args: unknown[]) => args,
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    ingredientCatalogItems: {
      id: "id",
      type: "type",
      category: "category",
      subtype: "subtype",
      familyId: "familyId",
      displayName: "displayName",
      displayNameRu: "displayNameRu",
      displayNameEn: "displayNameEn",
      brandName: "brandName",
      manufacturer: "manufacturer",
      country: "country",
      harvestYear: "harvestYear",
      defaultUnit: "defaultUnit",
      defaultDisplayUnit: "defaultDisplayUnit",
      allowedUnits: "allowedUnits",
      measurementDimension: "measurementDimension",
      completenessLevel: "completenessLevel",
      technicalData: "technicalData",
      normalizedName: "normalizedName",
      aliases: "aliases",
      searchAliasesNorm: "searchAliasesNorm",
      searchTextNorm: "searchTextNorm",
      status: "status",
      updatedAt: "updatedAt",
      mergedIntoId: "mergedIntoId"
    },
    ingredientFamilies: {
      id: "id",
      canonicalName: "canonicalName",
      displayNameEn: "displayNameEn",
      displayNameRu: "displayNameRu"
    },
    proposedIngredients: {
      id: "id",
      sourcePayload: "sourcePayload",
      sourceDisplayName: "sourceDisplayName",
      status: "status",
      targetIngredientId: "targetIngredientId",
      moderatorId: "moderatorId",
      createdAt: "createdAt",
      updatedAt: "updatedAt"
    }
  };
});

import { searchIngredientSuggestions } from "../features/ingredients/service";

describe("ingredient search service", () => {
  beforeEach(() => {
    mockState.limitCalls = 0;
    mockState.rows = [buildHopRow()];
  });

  it("falls back to ilike search when pg_trgm similarity is unavailable", async () => {
    const items = await searchIngredientSuggestions({ q: "Saa", type: "hop", limit: 8 });

    expect(items[0]).toMatchObject({
      displayName: "Saaz",
      displayNameRu: "Saaz",
      defaultUnit: "g",
      category: "hop",
      familyDisplayName: "Saaz",
      subtitle: "Bohemia Hop • Чехия • 3.5% AA • pellet • 2024",
      source: "catalog"
    });
    expect(mockState.limitCalls).toBe(2);
  });

  it("ranks pilsner results above noise for russian typo variants", async () => {
    mockState.rows = [
      buildFermentableRow({
        id: "kursk-pilsner",
        displayName: "Курский солод Pilsner",
        displayNameRu: "Курский солод Pilsner",
        displayNameEn: "Kursk Pilsner",
        brandName: "Курский солод",
        manufacturer: "Курский солод",
        country: "Россия",
        normalizedName: "курский солод pilsner",
        aliases: ["Курский солод Pilsner", "Kursk Pilsner"],
        searchAliasesNorm: ["курский солод pilsner", "kursk pilsner", "pilsner", "pilsen", "пилснер", "пильзнер", "пилсен"],
        searchTextNorm: "курский солод pilsner kursk pilsner pilsner pilsen пилснер пильзнер пилсен россия"
      }),
      buildFermentableRow({
        id: "munich-noise",
        displayName: "Castle Munich",
        displayNameRu: "Castle Munich",
        displayNameEn: "Castle Munich",
        familyCanonicalName: "Munich",
        familyDisplayNameEn: "Munich",
        familyDisplayNameRu: "Мюнхенский",
        normalizedName: "castle munich",
        aliases: ["Castle Munich"],
        searchAliasesNorm: ["castle munich", "munich", "мюнхенский"],
        searchTextNorm: "castle munich munich мюнхенский бельгия"
      })
    ];

    const items = await searchIngredientSuggestions({ q: "пильзнер", category: "fermentable", limit: 8 });

    expect(items[0]?.displayName).toBe("Kursk Pilsner");
    expect(items[0]?.displayNameRu).toBe("Курский солод Pilsner");
    expect(items[0]?.displayNameRu).not.toContain("Пильзнер");
  });

  it("tops brand-aware english queries correctly", async () => {
    mockState.rows = [
      buildFermentableRow({
        id: "soufflet-pilsen",
        displayName: "Soufflet Pilsen 2RP",
        displayNameRu: "Soufflet Pilsen 2RP",
        displayNameEn: "Soufflet Pilsen 2RP",
        brandName: "Soufflet",
        manufacturer: "Soufflet",
        country: "Франция",
        normalizedName: "soufflet pilsen 2rp",
        aliases: ["Soufflet Pilsen 2RP"],
        searchAliasesNorm: ["soufflet pilsen", "soufflet pilsner", "pilsen", "pilsner", "пилснер", "пильзнер"],
        searchTextNorm: "soufflet pilsen 2rp soufflet pilsner pilsen pilsner пилснер пильзнер франция"
      }),
      buildFermentableRow(),
      buildFermentableRow({
        id: "castle-vienna",
        displayName: "Castle Vienna",
        displayNameRu: "Castle Vienna",
        displayNameEn: "Castle Vienna",
        familyCanonicalName: "Vienna",
        familyDisplayNameEn: "Vienna",
        familyDisplayNameRu: "Венский",
        normalizedName: "castle vienna",
        aliases: ["Castle Vienna"],
        searchAliasesNorm: ["castle vienna", "vienna", "венский"],
        searchTextNorm: "castle vienna vienna венский castle malting бельгия"
      })
    ];

    const soufflet = await searchIngredientSuggestions({ q: "soufflet pilsen", category: "fermentable", limit: 8 });
    const castle = await searchIngredientSuggestions({ q: "castle pilsner", category: "fermentable", limit: 8 });
    const layoutSwap = await searchIngredientSuggestions({ q: "зшдытук", category: "fermentable", limit: 8 });

    expect(soufflet[0]?.displayNameRu).toBe("Soufflet Pilsen 2RP");
    expect(castle[0]?.displayNameRu).toBe("Castle Pilsner");
    expect(layoutSwap[0]?.displayNameRu).toBe("Castle Pilsner");
  });
});
