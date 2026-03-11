import { describe, expect, it } from "vitest";

import { normalizeAliasList, normalizeIngredientName } from "../features/ingredients/normalization";

describe("ingredient normalization", () => {
  it("normalizes casing, spaces and punctuation", () => {
    expect(normalizeIngredientName("  Citra,  Pellet  ")).toBe("citra pellet");
  });

  it("deduplicates aliases", () => {
    expect(normalizeAliasList(["Citra", " citra ", "CITRA"])).toEqual(["citra"]);
  });
});
