import { describe, expect, it } from "vitest";

import { sortRankedCatalogItems } from "../features/ingredients/catalog-ranking";
import { scoreIngredientCandidate } from "../features/ingredients/ranking";

describe("ingredient ranking", () => {
  const candidate = {
    displayName: "Soufflet Pilsen 2RP",
    normalizedName: "soufflet pilsen 2rp",
    aliases: ["Soufflet Pilsen 2RP", "Pilsner"],
    brandName: "Soufflet",
    manufacturer: "Soufflet"
  };
  const noiseCandidate = {
    displayName: "Castle Munich",
    normalizedName: "castle munich",
    aliases: ["Castle Munich"]
  };

  it("prioritizes exact match", () => {
    expect(scoreIngredientCandidate("soufflet pilsen", candidate)).toBeGreaterThan(scoreIngredientCandidate("soufflet pilsen", noiseCandidate));
  });

  it("supports alias search", () => {
    expect(scoreIngredientCandidate("pilsner", candidate)).toBeGreaterThan(100);
  });

  it("supports typo-tolerant score", () => {
    expect(scoreIngredientCandidate("пильзнер", candidate)).toBeGreaterThan(scoreIngredientCandidate("пильзнер", noiseCandidate));
  });

  it("always keeps custom ingredients above catalog ones in unified picker results", () => {
    const ranked: Array<{
      item: {
        source: "catalog" | "custom";
        primaryLabelRu: string;
      };
      score: number;
    }> = [
      {
        item: {
          source: "catalog" as const,
          primaryLabelRu: "Cascade"
        },
        score: 120
      },
      {
        item: {
          source: "custom" as const,
          primaryLabelRu: "Мой Cascade"
        },
        score: 10
      }
    ].sort(sortRankedCatalogItems);

    expect(ranked[0]?.item.source).toBe("custom");
    expect(ranked[1]?.item.source).toBe("catalog");
  });
});
