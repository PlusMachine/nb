import { describe, expect, it } from "vitest";

import { scoreIngredientCandidate } from "../features/ingredients/ranking";

describe("ingredient ranking", () => {
  const candidate = { displayName: "Citra", normalizedName: "citra", aliases: ["hbc 394"] };

  it("prioritizes exact match", () => {
    expect(scoreIngredientCandidate("citra", candidate)).toBeGreaterThan(scoreIngredientCandidate("cit", candidate));
  });

  it("supports alias search", () => {
    expect(scoreIngredientCandidate("hbc 394", candidate)).toBeGreaterThan(100);
  });

  it("supports typo-tolerant score", () => {
    expect(scoreIngredientCandidate("ctira", candidate)).toBeGreaterThan(0);
  });
});
