import { describe, expect, it } from "vitest";

import {
  estimateBrewhouseEfficiency,
  FERMENTABLE_PPG_PRESETS,
  predictOgAtEfficiency
} from "./efficiency";
import type { FermentableGrainBillItem } from "../types/recipe";

const baseMalt: FermentableGrainBillItem = {
  id: "pale",
  name: "Pale Malt",
  weightKg: 5,
  potentialPpg: 37,
  colorLovibond: 2
};

describe("estimateBrewhouseEfficiency", () => {
  it("backs out efficiency from a measured OG for an all-grain batch", () => {
    const result = estimateBrewhouseEfficiency({
      fermentables: [baseMalt],
      batchVolumeL: 23,
      measuredOg: 1.048
    });

    expect(result.grainPotentialPoints).toBeCloseTo(407.9, 1);
    expect(result.efficiencyPercent).toBe(71.5);
    expect(result.warnings).toEqual([]);
  });

  it("excludes 100%-dissolution fermentables (sugar) from the efficiency base", () => {
    const result = estimateBrewhouseEfficiency({
      fermentables: [
        baseMalt,
        {
          id: "sugar",
          name: "Table sugar",
          weightKg: 0.467,
          potentialPpg: 46,
          colorLovibond: 0,
          appliesBrewhouseEfficiency: false
        }
      ],
      batchVolumeL: 23,
      measuredOg: 1.052
    });

    // Same grain-only potential as the all-grain case above — the sugar does not
    // inflate the denominator, only the (subtracted) measured points.
    expect(result.grainPotentialPoints).toBeCloseTo(407.9, 1);
    expect(result.efficiencyPercent).toBe(65.9);
  });

  it("flags efficiency above 100%", () => {
    const result = estimateBrewhouseEfficiency({
      fermentables: [
        { id: "pale", name: "Pale Malt", weightKg: 2, potentialPpg: 37, colorLovibond: 2 }
      ],
      batchVolumeL: 20,
      measuredOg: 1.09
    });

    expect(result.efficiencyPercent).toBeGreaterThan(100);
    expect(result.warnings).toContain("efficiency_above_100");
  });

  it("flags unusually low efficiency", () => {
    const result = estimateBrewhouseEfficiency({
      fermentables: [baseMalt],
      batchVolumeL: 23,
      measuredOg: 1.02
    });

    expect(result.efficiencyPercent).toBeLessThan(50);
    expect(result.warnings).toContain("efficiency_low");
  });

  it("is impossible with no grain bill (only 100%-dissolution fermentables)", () => {
    const result = estimateBrewhouseEfficiency({
      fermentables: [
        { id: "dme", name: "Light DME", weightKg: 3, potentialPpg: 44, colorLovibond: 4, appliesBrewhouseEfficiency: false }
      ],
      batchVolumeL: 20,
      measuredOg: 1.05
    });

    expect(result.efficiencyPercent).toBe(0);
    expect(result.warnings).toContain("no_grain_bill");
  });

  it("is impossible with no measured points (OG at or below 1.000)", () => {
    const result = estimateBrewhouseEfficiency({
      fermentables: [baseMalt],
      batchVolumeL: 23,
      measuredOg: 1.0
    });

    expect(result.efficiencyPercent).toBe(0);
    expect(result.warnings).toContain("no_measured_points");
  });

  it("bails out instead of Infinity when the grain bill has zero potential points (e.g. custom PPG left blank)", () => {
    const result = estimateBrewhouseEfficiency({
      fermentables: [
        { id: "custom", name: "Custom", weightKg: 5, potentialPpg: 0, colorLovibond: 0 }
      ],
      batchVolumeL: 20,
      measuredOg: 1.05
    });

    expect(result.efficiencyPercent).toBe(0);
    expect(Number.isFinite(result.efficiencyPercent)).toBe(true);
    expect(result.warnings).toContain("no_grain_potential");
    expect(result.warnings).not.toContain("no_grain_bill");
  });

  it("clamps to 0 instead of negative when measured OG is below the extras' own contribution", () => {
    const result = estimateBrewhouseEfficiency({
      fermentables: [
        baseMalt,
        {
          id: "sugar",
          name: "Table sugar",
          weightKg: 2,
          potentialPpg: 46,
          colorLovibond: 0,
          appliesBrewhouseEfficiency: false
        }
      ],
      batchVolumeL: 20,
      // Deliberately low: below what the sugar alone would contribute at this volume.
      measuredOg: 1.03
    });

    expect(result.efficiencyPercent).toBe(0);
    expect(result.warnings).toContain("measured_og_below_extras");
    expect(result.warnings).not.toContain("efficiency_low");
  });
});

describe("predictOgAtEfficiency / estimateBrewhouseEfficiency round-trip", () => {
  it("recovers approximately the same efficiency used to predict the OG", () => {
    const brewhouseEfficiencyPercent = 75;
    const og = predictOgAtEfficiency({
      fermentables: [baseMalt],
      batchVolumeL: 23,
      brewhouseEfficiencyPercent
    });
    const recovered = estimateBrewhouseEfficiency({
      fermentables: [baseMalt],
      batchVolumeL: 23,
      measuredOg: og
    });

    // calculateOg rounds OG to 3 decimals, so the round trip is only approximate —
    // within a percentage point is the expected tolerance.
    expect(Math.abs(recovered.efficiencyPercent - brewhouseEfficiencyPercent)).toBeLessThanOrEqual(1);
  });
});

describe("FERMENTABLE_PPG_PRESETS", () => {
  it("marks grain presets as efficiency-applying and syrups/sugars as 100%-dissolution", () => {
    const grainKeys = ["base_malt", "wheat_malt", "munich", "crystal", "roasted", "flaked_adjunct"];
    const fullDissolutionKeys = ["sugar", "dme", "lme", "honey"];

    for (const key of grainKeys) {
      const preset = FERMENTABLE_PPG_PRESETS.find((item) => item.key === key);
      expect(preset?.appliesBrewhouseEfficiency).toBe(true);
    }
    for (const key of fullDissolutionKeys) {
      const preset = FERMENTABLE_PPG_PRESETS.find((item) => item.key === key);
      expect(preset?.appliesBrewhouseEfficiency).toBe(false);
    }
  });
});
