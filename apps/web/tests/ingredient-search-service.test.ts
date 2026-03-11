import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  limitCalls: 0,
  rows: [
    {
      id: "1",
      type: "hop",
      displayName: "Saaz",
      manufacturer: "Bohemia Hop",
      defaultUnit: "g",
      normalizedName: "saaz",
      aliases: ["saaz"],
      score: 0
    }
  ]
}));

vi.mock("@nb/db", () => {
  const queryChain = {
    from: () => ({
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
      displayName: "displayName",
      manufacturer: "manufacturer",
      defaultUnit: "defaultUnit",
      normalizedName: "normalizedName",
      aliases: "aliases",
      status: "status",
      updatedAt: "updatedAt",
      mergedIntoId: "mergedIntoId"
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
      source: "catalog"
    });
    expect(mockState.limitCalls).toBe(2);
  });
});
