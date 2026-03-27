import { describe, expect, it } from "vitest";

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
});
