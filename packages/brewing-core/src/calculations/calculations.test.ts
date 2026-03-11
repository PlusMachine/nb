import { describe, expect, it } from "vitest";
import {
  calculateAbv,
  calculateColor,
  calculateFg,
  calculateIbuTinseth,
  calculateOg,
  calculatePrimingSugarGrams,
  correctHydrometerReading,
  recalculateScaledStats,
  scaleRecipeBatch
} from "./index";
import type { ScalableRecipe } from "../types/recipe";

const fermentables = [
  { id: "pale", name: "Pale Malt", weightKg: 4.5, potentialPpg: 37, colorLovibond: 2 },
  { id: "crystal", name: "Crystal 40", weightKg: 0.3, potentialPpg: 34, colorLovibond: 40 }
];

const hops = [
  { id: "citra-60", name: "Citra", alphaAcidPercent: 12, weightG: 20, boilTimeMinutes: 60, use: "boil" as const },
  { id: "cascade-10", name: "Cascade", alphaAcidPercent: 6, weightG: 25, boilTimeMinutes: 10, use: "boil" as const }
];

describe("gravity and abv", () => {
  it("calculates OG/FG/ABV deterministically", () => {
    const og = calculateOg({ fermentables, batchVolumeL: 20, brewhouseEfficiencyPercent: 72 });
    const fg = calculateFg({ og, attenuationPercent: 75 });
    const abv = calculateAbv(og, fg);

    expect(og).toBe(1.053);
    expect(fg).toBe(1.013);
    expect(abv).toBe(5.25);
  });
});

describe("IBU and color", () => {
  it("calculates Tinseth IBU", () => {
    const ibu = calculateIbuTinseth({ og: 1.059, batchVolumeL: 20, hopAdditions: hops });
    expect(ibu).toBe(31.3);
  });

  it("calculates color via MCU->SRM->EBC", () => {
    const color = calculateColor(fermentables, 20);
    expect(color.mcu).toBe(8.76);
    expect(color.srm).toBe(6.6);
    expect(color.ebc).toBe(13);
  });
});

describe("priming and hydrometer correction", () => {
  it("calculates priming sugar mass", () => {
    const sugar = calculatePrimingSugarGrams({
      batchVolumeL: 20,
      targetCo2Volumes: 2.4,
      beerTemperatureC: 20,
      sugarType: "dextrose"
    });

    expect(sugar).toBe(20.6);
  });

  it("corrects hydrometer reading for temperature", () => {
    const corrected = correctHydrometerReading({ observedSg: 1.05, sampleTemperatureC: 30, calibrationTemperatureC: 20 });
    expect(corrected).toBe(1.053);
  });
});

describe("batch scaling", () => {
  it("scales ingredients by batch factor and recalculates stats", () => {
    const recipe: ScalableRecipe = { batchVolumeL: 20, fermentables, hops };
    const scaled = scaleRecipeBatch({ recipe, targetBatchVolumeL: 25 });

    expect(scaled.fermentables[0]?.weightKg).toBe(5.625);
    expect(scaled.hops[0]?.weightG).toBe(25);

    const stats = recalculateScaledStats({ recipe: scaled, efficiencyPercent: 72, attenuationPercent: 75 });
    expect(stats.og).toBe(1.053);
    expect(stats.abv).toBe(5.25);
    expect(stats.ibu).toBe(33.1);
  });
});
