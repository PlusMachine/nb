import { describe, expect, it } from "vitest";

import {
  extractIngredientTechnicalData,
  extractIngredientTechnicalFields,
  fermentableAppliesMashEfficiency,
  getIngredientColorLovibond,
  resolveHopEffectiveAlphaAcidPct,
  resolveIngredientTechnicalDataHopAlphaAcidPct
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

// Фолбэк эффективной альфа-кислотности хмеля: typical, если задан; иначе
// середина диапазона min-max (только когда заданы ОБА); иначе max; иначе min.
// Раньше пустой typical падал сразу на max, из-за чего IBU молча завышался до
// верхней границы диапазона сорта.
describe("resolveHopEffectiveAlphaAcidPct", () => {
  it("uses typical when present, ignoring min/max", () => {
    expect(resolveHopEffectiveAlphaAcidPct(7, 3, 20)).toBe(7);
  });

  it("uses the midpoint of min/max when typical is missing and both bounds are present", () => {
    expect(resolveHopEffectiveAlphaAcidPct(null, 4, 8)).toBe(6);
  });

  it("uses max when only max is present", () => {
    expect(resolveHopEffectiveAlphaAcidPct(null, null, 9)).toBe(9);
  });

  it("uses min when only min is present", () => {
    expect(resolveHopEffectiveAlphaAcidPct(null, 3, null)).toBe(3);
  });

  it("returns null when nothing is present", () => {
    expect(resolveHopEffectiveAlphaAcidPct(null, null, null)).toBeNull();
  });
});

describe("resolveIngredientTechnicalDataHopAlphaAcidPct", () => {
  it("returns null for non-hop technicalData", () => {
    expect(resolveIngredientTechnicalDataHopAlphaAcidPct({ type: "malt" })).toBeNull();
    expect(resolveIngredientTechnicalDataHopAlphaAcidPct(null)).toBeNull();
  });

  it("resolves the same chain as resolveHopEffectiveAlphaAcidPct for hop technicalData", () => {
    expect(resolveIngredientTechnicalDataHopAlphaAcidPct({
      type: "hop",
      alphaAcidPctTypical: null,
      alphaAcidPctMin: 4,
      alphaAcidPctMax: 8
    })).toBe(6);
  });
});

describe("extractIngredientTechnicalFields hop alpha fallback", () => {
  it("uses typical when present", () => {
    expect(extractIngredientTechnicalFields({
      type: "hop",
      attributes: {
        alpha_acid_pct_typical: 7,
        alpha_acid_pct_min: 3,
        alpha_acid_pct_max: 20
      }
    }).hopAlphaAcidPct).toBe(7);
  });

  it("falls back to the midpoint of min/max when typical is missing", () => {
    expect(extractIngredientTechnicalFields({
      type: "hop",
      attributes: {
        alpha_acid_pct_min: 4,
        alpha_acid_pct_max: 8
      }
    }).hopAlphaAcidPct).toBe(6);
  });

  it("falls back to max when only max is present", () => {
    expect(extractIngredientTechnicalFields({
      type: "hop",
      attributes: {
        alpha_acid_pct_max: 9
      }
    }).hopAlphaAcidPct).toBe(9);
  });

  it("falls back to min when only min is present", () => {
    expect(extractIngredientTechnicalFields({
      type: "hop",
      attributes: {
        alpha_acid_pct_min: 3
      }
    }).hopAlphaAcidPct).toBe(3);
  });

  it("returns null when nothing is present", () => {
    expect(extractIngredientTechnicalFields({
      type: "hop",
      attributes: {}
    }).hopAlphaAcidPct).toBeNull();
  });
});
