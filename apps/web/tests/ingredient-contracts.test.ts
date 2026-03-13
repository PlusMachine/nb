import { describe, expect, it } from "vitest";

import { ingredientSearchQuerySchema, ingredientUpsertSchema } from "../features/ingredients/contracts";

describe("ingredient search contracts", () => {
  it("accepts type filter", () => {
    const parsed = ingredientSearchQuerySchema.parse({ q: "citra", type: "hop" });
    expect(parsed.type).toBe("hop");
  });

  it("accepts category filter", () => {
    const parsed = ingredientSearchQuerySchema.parse({ q: "chloride", category: "water_prep" });
    expect(parsed.category).toBe("water_prep");
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

  it("accepts typed technicalData as the source of truth", () => {
    const parsed = ingredientUpsertSchema.parse({
      category: "fermentable",
      subtype: "base_malt",
      displayName: "Pilsner Malt",
      aliases: [],
      defaultDisplayUnit: "kg",
      technicalData: {
        category: "fermentable",
        subtype: "base_malt",
        colorEbc: 3.5,
        extractYieldPct: 80,
        proteinPct: null,
        moisturePct: null,
        maxUsagePercent: null,
        diastaticPowerLintner: null,
        usageFlags: []
      },
      properties: {}
    });

    expect(parsed.technicalData).toMatchObject({
      category: "fermentable",
      subtype: "base_malt"
    });
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

  it("rejects invalid category and subtype combinations", () => {
    expect(() => ingredientUpsertSchema.parse({
      category: "hop",
      subtype: "base_malt",
      displayName: "Broken Item",
      aliases: [],
      defaultDisplayUnit: "g",
      hopAlphaAcidPct: 12,
      properties: {}
    })).toThrow();
  });

  it("accepts water preparation payload using the new category source of truth", () => {
    const parsed = ingredientUpsertSchema.parse({
      category: "water_prep",
      subtype: "salt",
      displayName: "Calcium Chloride",
      aliases: [],
      defaultDisplayUnit: "g",
      properties: {
        compound: "calcium_chloride"
      }
    });

    expect(parsed.category).toBe("water_prep");
    expect(parsed.subtype).toBe("salt");
  });

  it("requires subtype-specific properties for water preparation records", () => {
    expect(() => ingredientUpsertSchema.parse({
      category: "water_prep",
      subtype: "acid",
      displayName: "Lactic Acid 88%",
      aliases: [],
      defaultDisplayUnit: "ml",
      properties: {}
    })).toThrow();
  });

  it("accepts optional advanced yeast fields when valid", () => {
    const parsed = ingredientUpsertSchema.parse({
      category: "yeast",
      subtype: "belgian",
      displayName: "Belle Saison",
      aliases: [],
      defaultDisplayUnit: "pack",
      yeastForm: "dry",
      yeastAttenuationPct: 86,
      yeastMinFermentationTempC: 18,
      yeastMaxFermentationTempC: 28,
      yeastFlocculation: "high",
      yeastAlcoholTolerancePct: 12,
      yeastPackageSize: 11.5,
      yeastPackageUnit: "g",
      yeastPhenolic: true,
      yeastDiastaticus: true,
      properties: {}
    });

    expect(parsed.yeastFlocculation).toBe("high");
    expect(parsed.yeastPhenolic).toBe(true);
  });

  it("requires strength for liquid water preparation acids", () => {
    expect(() => ingredientUpsertSchema.parse({
      category: "water_prep",
      subtype: "acid",
      displayName: "Phosphoric Acid",
      aliases: [],
      defaultDisplayUnit: "ml",
      waterPrepAcidType: "phosphoric",
      waterPrepPhysicalForm: "liquid",
      properties: {}
    })).toThrow();
  });
});
