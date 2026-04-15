import { describe, expect, it } from "vitest";

import {
  alkalinityAsCaCO3FromHco3,
  applySaltAdditions,
  acidNeutralizationMeqPerMl,
  estimateMashPh,
  residualAlkalinityAsCaCO3,
  solveMashAcidAddition,
  solveWaterTargetProfile,
  sulfateChlorideRatio,
  type WaterProfile
} from "./water";

const softWater: WaterProfile = {
  ca: 20,
  mg: 5,
  na: 10,
  cl: 20,
  so4: 25,
  hco3: 60,
  ph: 7.4
};

describe("water chemistry", () => {
  it("applies strict salt mass fractions to ion deltas", () => {
    const profile = applySaltAdditions(softWater, 20, [
      { salt: "gypsum", grams: 2 },
      { salt: "calcium_chloride", grams: 1 }
    ]);

    expect(profile.ca).toBeCloseTo(56.91, 2);
    expect(profile.so4).toBeCloseTo(80.8, 1);
    expect(profile.cl).toBeCloseTo(44.12, 1);
  });

  it("calculates alkalinity and residual alkalinity helpers", () => {
    expect(alkalinityAsCaCO3FromHco3(60)).toBe(49.18);
    expect(residualAlkalinityAsCaCO3(softWater)).toBe(31.95);
  });

  it("solves toward a target profile with allowed salts", () => {
    const result = solveWaterTargetProfile({
      sourceProfile: softWater,
      targetProfile: { ca: 80, mg: 12, na: 10, cl: 90, so4: 150, hco3: 60 },
      waterLiters: 25,
      allowedSalts: ["gypsum", "calcium_chloride", "epsom_salt"]
    });

    expect(result.additions.length).toBeGreaterThan(0);
    expect(result.finalProfile.ca).toBeGreaterThan(softWater.ca);
    expect(result.finalProfile.so4).toBeGreaterThan(softWater.so4);
    expect(result.finalProfile.cl).toBeGreaterThan(softWater.cl);
  });

  it("estimates mash pH with RA and grist acidity components", () => {
    const estimate = estimateMashPh({
      sourceProfile: softWater,
      mashWaterLiters: 15,
      grainKg: 5,
      beerSrm: 28,
      pctNonRoastedSpecialty: 8,
      pctRoasted: 6,
      pctCrystalCaramel: 5
    });

    expect(estimate.model).toBe("hybrid_mash_ph_v1");
    expect(estimate.predictedMashPh20C).toBeLessThan(5.8);
    expect(estimate.warnings).toContain("mash_ph_ballpark_estimate");
  });

  it("calculates sulfate chloride ratio", () => {
    expect(sulfateChlorideRatio({ ...softWater, so4: 120, cl: 60 })).toBe(2);
  });

  it("solves mash acid additions with a bounded monotonic search", () => {
    const result = solveMashAcidAddition({
      unadjustedMashPh20C: 5.72,
      targetMashPh20C: 5.35,
      mashWaterLiters: 16,
      grainKg: 5,
      alkalinityAsCaCO3: alkalinityAsCaCO3FromHco3(softWater.hco3),
      acid: "lactic_acid",
      concentrationPct: 88
    });

    expect(acidNeutralizationMeqPerMl("lactic_acid", 88)).toBeGreaterThan(10);
    expect(result.mashAcidMl).toBeGreaterThan(0);
    expect(result.predictedMashPh20C).toBeCloseTo(5.35, 1);
    expect(result.warnings).toContain("mash_acid_model_practical_approximation");
  });
});
