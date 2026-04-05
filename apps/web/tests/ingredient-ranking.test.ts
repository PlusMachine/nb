import { describe, expect, it } from "vitest";

import { sortRankedCatalogItems } from "../features/ingredients/catalog-ranking";
import {
  rankIngredientCandidate,
  scoreIngredientCandidate
} from "../features/ingredients/ranking";

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

  it("keeps direct family names and pure canonical family aliases in the same strong generic-family bucket", () => {
    const primaryName = rankIngredientCandidate("пилснер", {
      displayName: "Пилснер",
      displayNameRu: "Пилснер",
      nameRu: "Пилснер"
    });
    const canonicalAlias = rankIngredientCandidate("пилснер", {
      displayName: "Pilsen 2RP",
      displayNameEn: "Pilsen 2RP",
      nameEn: "Pilsen 2RP",
      aliases: [{ alias: "пилснер", aliasNormalized: "пилснер" }]
    });

    expect(primaryName?.tier).toBe(0);
    expect(canonicalAlias?.tier).toBe(0);
    expect((primaryName?.score ?? 0) - (canonicalAlias?.score ?? 0)).toBeGreaterThan(0);
    expect((primaryName?.score ?? 0) - (canonicalAlias?.score ?? 0)).toBeLessThan(40);
  });

  it("keeps cross-script canonical family equivalents near the top with only a mild same-script preference", () => {
    const englishPrimary = rankIngredientCandidate("pilsner", {
      displayName: "Pilsner",
      displayNameEn: "Pilsner",
      nameEn: "Pilsner"
    });
    const crossScriptAlias = rankIngredientCandidate("pilsner", {
      displayName: "Пильзен 2RP",
      displayNameRu: "Пильзен 2RP",
      nameRu: "Пильзен 2RP",
      aliases: [{ alias: "pilsner", aliasNormalized: "pilsner" }]
    });

    expect(englishPrimary?.tier).toBe(0);
    expect(crossScriptAlias?.tier).toBe(0);
    expect((englishPrimary?.score ?? 0)).toBeGreaterThan(crossScriptAlias?.score ?? 0);
    expect((englishPrimary?.score ?? 0) - (crossScriptAlias?.score ?? 0)).toBeLessThan(50);
  });

  it("treats pure canonical family aliases stronger than helper alias phrases", () => {
    const canonicalAlias = rankIngredientCandidate("пилснер", {
      displayName: "Base Malt",
      aliases: [{ alias: "пилснер", aliasNormalized: "пилснер" }]
    });
    const helperAlias = rankIngredientCandidate("пилснер", {
      displayName: "Base Malt",
      aliases: [{ alias: "пилснер база", aliasNormalized: "пилснер база" }]
    });

    expect(canonicalAlias?.tier).toBeLessThan(helperAlias?.tier ?? Number.MAX_SAFE_INTEGER);
    expect((canonicalAlias?.score ?? 0)).toBeGreaterThan(helperAlias?.score ?? 0);
  });

  it("keeps stronger catalog relevance above weaker custom matches", () => {
    const ranked: Array<{
      item: {
        source: "catalog" | "custom";
        primaryLabelRu: string;
        isFavorite?: boolean;
      };
      tier?: number;
      score: number;
    }> = [
      {
        item: {
          source: "catalog" as const,
          primaryLabelRu: "Pilsner"
        },
        tier: 0,
        score: 9000
      },
      {
        item: {
          source: "custom" as const,
          primaryLabelRu: "My Pilsen"
        },
        tier: 3,
        score: 6500
      }
    ].sort(sortRankedCatalogItems);

    expect(ranked[0]?.item.source).toBe("catalog");
    expect(ranked[1]?.item.source).toBe("custom");
  });

  it("uses custom only as a tie-breaker inside the same semantic tier", () => {
    const ranked: Array<{
      item: {
        source: "catalog" | "custom";
        primaryLabelRu: string;
        isFavorite?: boolean;
      };
      tier?: number;
      score: number;
    }> = [
      {
        item: {
          source: "catalog" as const,
          primaryLabelRu: "Pilsner Premium"
        },
        tier: 1,
        score: 8200
      },
      {
        item: {
          source: "custom" as const,
          primaryLabelRu: "Pilsner Premium"
        },
        tier: 1,
        score: 8200
      }
    ].sort(sortRankedCatalogItems);

    expect(ranked[0]?.item.source).toBe("custom");
    expect(ranked[1]?.item.source).toBe("catalog");
  });

  it("uses favorites only as a soft tie-breaker between equally relevant items", () => {
    const ranked: Array<{
      item: {
        source: "catalog" | "custom";
        primaryLabelRu: string;
        isFavorite?: boolean;
      };
      tier?: number;
      score: number;
    }> = [
      {
        item: {
          source: "catalog" as const,
          primaryLabelRu: "Citra",
          isFavorite: false
        },
        tier: 1,
        score: 120
      },
      {
        item: {
          source: "catalog" as const,
          primaryLabelRu: "Citra Yakima",
          isFavorite: true
        },
        tier: 1,
        score: 120
      }
    ].sort(sortRankedCatalogItems);

    expect(ranked[0]?.item.primaryLabelRu).toBe("Citra Yakima");
    expect(ranked[0]?.item.isFavorite).toBe(true);
  });

  it("does not let favorites outrank stronger relevance", () => {
    const ranked: Array<{
      item: {
        source: "catalog" | "custom";
        primaryLabelRu: string;
        isFavorite?: boolean;
      };
      tier?: number;
      score: number;
    }> = [
      {
        item: {
          source: "catalog" as const,
          primaryLabelRu: "Pilsner",
          isFavorite: false
        },
        tier: 0,
        score: 140
      },
      {
        item: {
          source: "catalog" as const,
          primaryLabelRu: "Organic Pilsner Blend",
          isFavorite: true
        },
        tier: 3,
        score: 110
      }
    ].sort(sortRankedCatalogItems);

    expect(ranked[0]?.item.primaryLabelRu).toBe("Pilsner");
    expect(ranked[1]?.item.isFavorite).toBe(true);
  });
});
