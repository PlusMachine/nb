import { describe, expect, it } from "vitest";

import {
  extractIngredientTechnicalData,
  fermentableAppliesMashEfficiency,
  getIngredientColorLovibond
} from "../features/ingredients/technical-fields";

describe("ingredient technical fields", () => {
  it("uses the average EBC from malt ranges for calculator color", () => {
    expect(getIngredientColorLovibond({
      type: "malt",
      attributes: {
        color_ebc_min: 4,
        color_ebc_max: 8
      }
    }, 2)).toBe(3.05);
  });

  it("drops negative fermentable color values during normalization", () => {
    expect(extractIngredientTechnicalData({
      type: "fermentable",
      attributes: {
        extract_form: "liquid",
        extract_pct_dry_basis: 80,
        color_lovibond: -0.5
      }
    })).toMatchObject({
      type: "fermentable",
      extractForm: "liquid",
      extractPctDryBasis: 80,
      colorLovibond: null
    });
  });

  it("sanitizes pre-existing structured technicalData records", () => {
    expect(extractIngredientTechnicalData({
      type: "fermentable",
      technicalData: {
        type: "fermentable",
        extractForm: "dry",
        colorLovibond: -6.2,
        extractPctDryBasis: 79
      }
    })).toMatchObject({
      type: "fermentable",
      extractForm: "dry",
      colorLovibond: null,
      extractPctDryBasis: 79
    });
  });
});

describe("fermentableAppliesMashEfficiency", () => {
  it("applies efficiency to malt (grain must be mashed)", () => {
    expect(fermentableAppliesMashEfficiency({ type: "malt" })).toBe(true);
  });

  it("applies efficiency to unmalted grain adjuncts", () => {
    expect(fermentableAppliesMashEfficiency({ type: "fermentable", productFamily: "adjunct_grain" })).toBe(true);
  });

  it("does not apply efficiency to extract, sugar, honey or fruit (~100%)", () => {
    expect(fermentableAppliesMashEfficiency({ type: "fermentable", productFamily: "extract_concentrate" })).toBe(false);
    expect(fermentableAppliesMashEfficiency({ type: "fermentable", productFamily: "sugar_syrup_honey" })).toBe(false);
    expect(fermentableAppliesMashEfficiency({ type: "fermentable", productFamily: "fruit_vegetable" })).toBe(false);
  });

  it("treats a custom fermentable with no productFamily as ~100% (sugars/syrups/honey bucket)", () => {
    expect(fermentableAppliesMashEfficiency({ type: "fermentable" })).toBe(false);
  });

  it("falls back to the recipe-level malt flag when technicalData is absent", () => {
    expect(fermentableAppliesMashEfficiency(null, true)).toBe(true);
    expect(fermentableAppliesMashEfficiency(null, false)).toBe(false);
    expect(fermentableAppliesMashEfficiency(undefined)).toBe(false);
  });
});
