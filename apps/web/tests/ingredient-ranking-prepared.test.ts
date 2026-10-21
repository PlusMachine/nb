import { describe, expect, it } from "vitest";

import { createIngredientFamilyMatcher, createIngredientRanker, prepareIngredientCandidate, matchesIngredientFamilyScope, rankIngredientCandidate } from "../features/ingredients/ranking";
import baseline from "./fixtures/ingredient-ranking-baseline.json";
import { rankingCandidates } from "./fixtures/ingredient-ranking-corpus";

const preparedCandidates = rankingCandidates.map(prepareIngredientCandidate);

describe("prepared ingredient search preserves the pre-optimization ranking", () => {
  it.each(baseline)("$query (layout=$includeLayoutVariants)", ({ query, includeLayoutVariants, ranks }) => {
    const rank = createIngredientRanker(query, { includeLayoutVariants });
    expect(rankingCandidates.map((candidate) => ({ id: candidate.id, rank: rank(candidate) }))).toEqual(ranks);
    expect(rankingCandidates.map((candidate, index) => ({ id: candidate.id, rank: rank(candidate, preparedCandidates[index]) }))).toEqual(ranks);
  });

  it("keeps user context on each candidate instead of capturing it in the query", () => {
    const rank = createIngredientRanker("пилснер");
    const plain = { displayName: "Пилснер", source: "catalog" as const };
    const favorite = { ...plain, isFavorite: true, inventoryUsageCount: 5 };
    const prepared = prepareIngredientCandidate(plain);
    expect(rank(plain, prepared)).toEqual(rankIngredientCandidate("пилснер", plain));
    expect(rank(favorite, prepared)).toEqual(rankIngredientCandidate("пилснер", favorite));
    expect(rank(plain, prepared)).toEqual(rankIngredientCandidate("пилснер", plain));
  });

  it("preserves the legacy array-query contract and family scope matching", () => {
    const rank = createIngredientRanker(["пилснер", "citra"]);
    const matchesFamily = createIngredientFamilyMatcher("пилснер");
    for (const candidate of rankingCandidates) {
      expect(rank(candidate)).toEqual(rankIngredientCandidate("пилснер", candidate));
      expect(matchesFamily(candidate)).toBe(matchesIngredientFamilyScope("пилснер", candidate));
    }
  });
});
