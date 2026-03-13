import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  limitCalls: 0,
  rows: [
    {
      id: "1",
      type: "hop",
      category: "hop",
      subtype: "pellet",
      familyId: "fam-1",
      familyCanonicalName: "Saaz",
      familyDisplayNameEn: "Saaz",
      familyDisplayNameRu: null,
      displayName: "Saaz",
      brandName: null,
      manufacturer: "Bohemia Hop",
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
      aliases: ["saaz"],
      score: 0
    }
  ]
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
      brandName: "brandName",
      manufacturer: "manufacturer",
      defaultUnit: "defaultUnit",
      defaultDisplayUnit: "defaultDisplayUnit",
      allowedUnits: "allowedUnits",
      measurementDimension: "measurementDimension",
      completenessLevel: "completenessLevel",
      normalizedName: "normalizedName",
      aliases: "aliases",
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
  });

  it("falls back to ilike search when pg_trgm similarity is unavailable", async () => {
    const items = await searchIngredientSuggestions({ q: "Saa", type: "hop", limit: 8 });

    expect(items[0]).toMatchObject({
      displayName: "Saaz",
      defaultUnit: "g",
      category: "hop",
      familyDisplayName: "Saaz",
      subtitle: "3.5% AA • pellet • 2024",
      source: "catalog"
    });
    expect(mockState.limitCalls).toBe(2);
  });
});
