import { describe, expect, it } from "vitest";

import { ingredientSearchQuerySchema, ingredientUpsertSchema } from "../features/ingredients/contracts";

describe("ingredient search contracts", () => {
  it("accepts type filter", () => {
    const parsed = ingredientSearchQuerySchema.parse({ q: "citra", type: "hop" });
    expect(parsed.type).toBe("hop");
  });

  it("requires fermentable technical fields", () => {
    expect(() => ingredientUpsertSchema.parse({
      type: "fermentable",
      displayName: "Pilsner Malt",
      defaultUnit: "g",
      aliases: [],
      properties: {}
    })).toThrow();
  });

  it("accepts complete hop technical fields", () => {
    const parsed = ingredientUpsertSchema.parse({
      type: "hop",
      displayName: "Citra",
      defaultUnit: "g",
      aliases: [],
      country: "US",
      hopAlphaAcidPct: 12,
      hopForm: "pellet",
      properties: {}
    });

    expect(parsed.hopAlphaAcidPct).toBe(12);
    expect(parsed.hopForm).toBe("pellet");
  });

  it("rejects inverted yeast fermentation temperatures", () => {
    expect(() => ingredientUpsertSchema.parse({
      type: "yeast",
      displayName: "US-05",
      defaultUnit: "pack",
      aliases: [],
      yeastAttenuationPct: 78,
      yeastType: "ale",
      yeastForm: "dry",
      yeastMinFermentationTempC: 24,
      yeastMaxFermentationTempC: 18,
      properties: {}
    })).toThrow();
  });
});
