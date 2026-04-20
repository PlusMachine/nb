import { describe, expect, it } from "vitest";
import { calculateAbv } from "@nb/brewing-core";

import { defaultRecipeProcessMeta, type RecipeCalculationMeta } from "../features/recipes/contracts";
import { calculateRecipeFgEstimate, resolveRecipeFgSourceLabel } from "../features/recipes/fg-estimate";

const OG = 1.052;

const buildCalculationMeta = (overrides: Partial<RecipeCalculationMeta> = {}): RecipeCalculationMeta => ({
  bitternessFormula: "tinseth_whirlpool_v2",
  bitternessSettings: {},
  ...overrides
});

const buildMashProfile = (temperatureC: number) => ({
  ...defaultRecipeProcessMeta,
  mashProfile: {
    steps: [{ id: "m1", name: "Main rest", temperatureC, durationMinutes: 60 }]
  }
});

const baseFermentables = [
  {
    name: "Pale Malt",
    weightKg: 4,
    potentialPpg: 37,
    technicalData: { type: "malt", extractPctDryBasis: 80, colorLovibond: 2 } as const
  }
];

const rangeYeast = [{
  name: "US-05",
  technicalData: {
    type: "yeast",
    attenuationPctMin: 74,
    attenuationPctMax: 82,
    attenuationPctTypical: 78,
    form: "dry"
  } as const
}];

describe("recipe FG estimate", () => {
  it("returns unavailable when there are no fermentables", () => {
    const result = calculateRecipeFgEstimate({
      og: null,
      fermentables: [],
      yeasts: [],
      processMeta: defaultRecipeProcessMeta,
      calculationMeta: buildCalculationMeta()
    });

    expect(result.predictedFg).toBeNull();
    expect(result.fgEstimateMode).toBe("unavailable");
    expect(result.fgEstimateDetails).toBeNull();
  });

  it("uses the default 75% attenuation when no yeast is selected", () => {
    const result = calculateRecipeFgEstimate({
      og: OG,
      fermentables: baseFermentables,
      yeasts: [],
      processMeta: defaultRecipeProcessMeta,
      calculationMeta: buildCalculationMeta()
    });

    expect(result.fgEstimateMode).toBe("default_estimate");
    expect(result.fgEstimateDetails?.baseAttenuationPct).toBe(75);
    expect(result.predictedFg).toBe(1.013);
  });

  it("lowers FG at 65C compared with 67C", () => {
    const at67 = calculateRecipeFgEstimate({
      og: OG,
      fermentables: baseFermentables,
      yeasts: [],
      processMeta: buildMashProfile(67),
      calculationMeta: buildCalculationMeta()
    });
    const at65 = calculateRecipeFgEstimate({
      og: OG,
      fermentables: baseFermentables,
      yeasts: [],
      processMeta: buildMashProfile(65),
      calculationMeta: buildCalculationMeta()
    });

    expect(at65.predictedFg).toBeLessThan(at67.predictedFg ?? 99);
  });

  it("raises FG at 69C compared with 67C", () => {
    const at67 = calculateRecipeFgEstimate({
      og: OG,
      fermentables: baseFermentables,
      yeasts: [],
      processMeta: buildMashProfile(67),
      calculationMeta: buildCalculationMeta()
    });
    const at69 = calculateRecipeFgEstimate({
      og: OG,
      fermentables: baseFermentables,
      yeasts: [],
      processMeta: buildMashProfile(69),
      calculationMeta: buildCalculationMeta()
    });

    expect(at69.predictedFg).toBeGreaterThan(at67.predictedFg ?? 0);
  });

  it("changes FG when yeast attenuation is available", () => {
    const defaultEstimate = calculateRecipeFgEstimate({
      og: OG,
      fermentables: baseFermentables,
      yeasts: [],
      processMeta: defaultRecipeProcessMeta,
      calculationMeta: buildCalculationMeta()
    });
    const yeastEstimate = calculateRecipeFgEstimate({
      og: OG,
      fermentables: baseFermentables,
      yeasts: rangeYeast,
      processMeta: defaultRecipeProcessMeta,
      calculationMeta: buildCalculationMeta()
    });

    expect(yeastEstimate.fgEstimateMode).toBe("yeast_estimate");
    expect(yeastEstimate.predictedFg).toBeLessThan(defaultEstimate.predictedFg ?? 99);
  });

  it("uses the yeast midpoint for the main estimate", () => {
    const result = calculateRecipeFgEstimate({
      og: OG,
      fermentables: baseFermentables,
      yeasts: rangeYeast,
      processMeta: defaultRecipeProcessMeta,
      calculationMeta: buildCalculationMeta()
    });

    expect(result.fgEstimateDetails?.baseAttenuationPct).toBe(78);
    expect(result.predictedFg).toBe(1.011);
  });

  it("builds FG range from min and max yeast attenuation", () => {
    const result = calculateRecipeFgEstimate({
      og: OG,
      fermentables: baseFermentables,
      yeasts: rangeYeast,
      processMeta: defaultRecipeProcessMeta,
      calculationMeta: buildCalculationMeta()
    });

    expect(result.fgEstimateDetails?.fgRangeMin).toBe(1.009);
    expect(result.fgEstimateDetails?.fgRangeMax).toBe(1.014);
    expect((result.fgEstimateDetails?.fgRangeMin ?? 0) < (result.predictedFg ?? 0)).toBe(true);
    expect((result.fgEstimateDetails?.fgRangeMax ?? 0) > (result.predictedFg ?? 0)).toBe(true);
  });

  it("lowers FG when simple sugars contribute gravity points", () => {
    const base = calculateRecipeFgEstimate({
      og: OG,
      fermentables: baseFermentables,
      yeasts: [],
      processMeta: defaultRecipeProcessMeta,
      calculationMeta: buildCalculationMeta()
    });
    const withSugar = calculateRecipeFgEstimate({
      og: OG,
      fermentables: [
        ...baseFermentables,
        {
          name: "Dextrose",
          weightKg: 1,
          potentialPpg: 46,
          technicalData: { type: "fermentable", productFamily: "simple sugar" } as const
        }
      ],
      yeasts: [],
      processMeta: defaultRecipeProcessMeta,
      calculationMeta: buildCalculationMeta()
    });

    expect(withSugar.fgEstimateDetails?.simpleSugarAdj).toBeGreaterThan(0);
    expect(withSugar.predictedFg).toBeLessThan(base.predictedFg ?? 99);
  });

  it("raises FG when crystal or dextrin fermentables contribute gravity points", () => {
    const base = calculateRecipeFgEstimate({
      og: OG,
      fermentables: baseFermentables,
      yeasts: [],
      processMeta: defaultRecipeProcessMeta,
      calculationMeta: buildCalculationMeta()
    });
    const withCrystal = calculateRecipeFgEstimate({
      og: OG,
      fermentables: [
        ...baseFermentables,
        {
          name: "Crystal 40",
          weightKg: 0.5,
          potentialPpg: 34,
          technicalData: { type: "malt", maltType: "crystal" } as const
        }
      ],
      yeasts: [],
      processMeta: defaultRecipeProcessMeta,
      calculationMeta: buildCalculationMeta()
    });

    expect(withCrystal.fgEstimateDetails?.crystalDextrinAdj).toBeGreaterThan(0);
    expect(withCrystal.predictedFg).toBeGreaterThan(base.predictedFg ?? 0);
  });

  it("raises FG more strongly for lactose than for dextrin malt", () => {
    const dextrin = calculateRecipeFgEstimate({
      og: OG,
      fermentables: [
        ...baseFermentables,
        {
          name: "Carapils",
          weightKg: 0.7,
          potentialPpg: 35,
          technicalData: { type: "malt", maltType: "dextrin" } as const
        }
      ],
      yeasts: [],
      processMeta: defaultRecipeProcessMeta,
      calculationMeta: buildCalculationMeta()
    });
    const lactose = calculateRecipeFgEstimate({
      og: OG,
      fermentables: [
        ...baseFermentables,
        {
          name: "Lactose",
          weightKg: 0.7,
          potentialPpg: 35,
          technicalData: { type: "fermentable", productFamily: "lactose" } as const
        }
      ],
      yeasts: [],
      processMeta: defaultRecipeProcessMeta,
      calculationMeta: buildCalculationMeta()
    });

    expect(lactose.fgEstimateDetails?.lactoseAdj).toBeGreaterThan(dextrin.fgEstimateDetails?.crystalDextrinAdj ?? 0);
    expect(lactose.predictedFg).toBeGreaterThan(dextrin.predictedFg ?? 0);
  });

  it("gives manual attenuation override priority over yeast attenuation", () => {
    const result = calculateRecipeFgEstimate({
      og: OG,
      fermentables: baseFermentables,
      yeasts: rangeYeast,
      processMeta: defaultRecipeProcessMeta,
      calculationMeta: buildCalculationMeta({ manualAttenuationOverridePct: 70 })
    });

    expect(result.fgEstimateMode).toBe("manual_attenuation_override");
    expect(result.fgEstimateDetails?.baseAttenuationPct).toBe(70);
    expect(result.predictedFg).toBe(1.016);
  });

  it("gives manual FG override priority over every other driver", () => {
    const result = calculateRecipeFgEstimate({
      og: OG,
      fermentables: baseFermentables,
      yeasts: rangeYeast,
      processMeta: buildMashProfile(65),
      calculationMeta: buildCalculationMeta({
        manualAttenuationOverridePct: 70,
        manualFgOverrideValue: 1.02
      })
    });

    expect(result.fgEstimateMode).toBe("manual_fg_override");
    expect(result.predictedFg).toBe(1.02);
    expect(result.fgEstimateDetails).toBeNull();
  });

  it("keeps fallback labels compact", () => {
    const result = calculateRecipeFgEstimate({
      og: OG,
      fermentables: baseFermentables,
      yeasts: [],
      processMeta: buildMashProfile(65),
      calculationMeta: buildCalculationMeta()
    });

    expect(resolveRecipeFgSourceLabel(result.fgEstimateMode, result.fgEstimateDetails)).toBe("Прогноз по умолчанию");
  });

  it("hides normal yeast estimate labels", () => {
    const result = calculateRecipeFgEstimate({
      og: OG,
      fermentables: baseFermentables,
      yeasts: rangeYeast,
      processMeta: buildMashProfile(65),
      calculationMeta: buildCalculationMeta()
    });

    expect(resolveRecipeFgSourceLabel(result.fgEstimateMode, result.fgEstimateDetails)).toBeNull();
  });

  it("uses short manual override labels", () => {
    expect(resolveRecipeFgSourceLabel("manual_attenuation_override", null)).toBe("Ручная attenuation");
    expect(resolveRecipeFgSourceLabel("manual_fg_override", null)).toBe("Ручной FG");
  });

  it("updates ABV when the new FG estimate changes", () => {
    const defaultEstimate = calculateRecipeFgEstimate({
      og: OG,
      fermentables: baseFermentables,
      yeasts: [],
      processMeta: defaultRecipeProcessMeta,
      calculationMeta: buildCalculationMeta()
    });
    const yeastEstimate = calculateRecipeFgEstimate({
      og: OG,
      fermentables: baseFermentables,
      yeasts: rangeYeast,
      processMeta: buildMashProfile(65),
      calculationMeta: buildCalculationMeta()
    });

    const defaultAbv = calculateAbv(OG, defaultEstimate.predictedFg ?? 1);
    const yeastAbv = calculateAbv(OG, yeastEstimate.predictedFg ?? 1);

    expect(yeastAbv).toBeGreaterThan(defaultAbv);
  });
});
