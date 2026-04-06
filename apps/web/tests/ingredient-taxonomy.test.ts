import { describe, expect, it } from "vitest";

import { resolveIngredientSubtype } from "../features/ingredients/taxonomy";

describe("ingredient taxonomy", () => {
  it("keeps seeded fermentables in the fermentable subtype even when itemKind contains malt", () => {
    expect(resolveIngredientSubtype({
      type: "fermentable",
      subtype: "malt_extract"
    })).toBe("fermentable");
  });

  it("treats extract-like fermentable snapshot tokens as fermentable", () => {
    expect(resolveIngredientSubtype({
      category: "fermentable",
      subtype: "malt_extract"
    })).toBe("fermentable");
    expect(resolveIngredientSubtype({
      category: "fermentable",
      subtype: "liquid_malt_extract"
    })).toBe("fermentable");
  });

  it("still treats actual malt tokens as malt", () => {
    expect(resolveIngredientSubtype({
      category: "fermentable",
      subtype: "base_malt"
    })).toBe("malt");
  });
});
