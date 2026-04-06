import { describe, expect, it } from "vitest";

import {
  extractIngredientTechnicalData,
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
