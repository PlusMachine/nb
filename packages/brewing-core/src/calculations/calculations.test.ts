import { describe, expect, it } from "vitest";
import {
  calculateAbv,
  calculateBitterness,
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

describe("per-fermentable efficiency", () => {
  it("does not apply brewhouse efficiency to extract/sugar (converts ~100%)", () => {
    const asGrain = calculateOg({
      fermentables: [{ id: "dme", name: "Light DME", weightKg: 3, potentialPpg: 44, colorLovibond: 4 }],
      batchVolumeL: 20,
      brewhouseEfficiencyPercent: 72
    });
    const asExtract = calculateOg({
      fermentables: [
        { id: "dme", name: "Light DME", weightKg: 3, potentialPpg: 44, colorLovibond: 4, appliesBrewhouseEfficiency: false }
      ],
      batchVolumeL: 20,
      brewhouseEfficiencyPercent: 72
    });

    // Wrongly applying 72% efficiency understates extract OG; at ~100% it must be higher.
    expect(asExtract).toBeGreaterThan(asGrain);
  });

  it("keeps all-grain OG identical to the legacy uniform behaviour", () => {
    const og = calculateOg({
      fermentables: fermentables.map((item) => ({ ...item, appliesBrewhouseEfficiency: true })),
      batchVolumeL: 20,
      brewhouseEfficiencyPercent: 72
    });

    expect(og).toBe(1.053);
  });

  it("adds grain (efficiency) and sugar (100%) on the correct bases", () => {
    const mixed = calculateOg({
      fermentables: [
        { id: "pale", name: "Pale", weightKg: 4, potentialPpg: 37, colorLovibond: 2, appliesBrewhouseEfficiency: true },
        { id: "sugar", name: "Table sugar", weightKg: 0.5, potentialPpg: 46, colorLovibond: 0, appliesBrewhouseEfficiency: false }
      ],
      batchVolumeL: 20,
      brewhouseEfficiencyPercent: 70
    });
    const ifSugarAlsoLostEfficiency = calculateOg({
      fermentables: [
        { id: "pale", name: "Pale", weightKg: 4, potentialPpg: 37, colorLovibond: 2 },
        { id: "sugar", name: "Table sugar", weightKg: 0.5, potentialPpg: 46, colorLovibond: 0 }
      ],
      batchVolumeL: 20,
      brewhouseEfficiencyPercent: 70
    });

    expect(mixed).toBeGreaterThan(ifSugarAlsoLostEfficiency);
  });
});

describe("IBU and color", () => {
  it("calculates Tinseth IBU", () => {
    const ibu = calculateIbuTinseth({ og: 1.059, batchVolumeL: 20, hopAdditions: hops });
    expect(ibu).toBe(31.3);
  });

  it("calculates whirlpool bitterness in the default Tinseth v2 engine", () => {
    const result = calculateBitterness({
      formula: "tinseth_whirlpool_v2",
      og: 1.059,
      batchVolumeL: 20,
      boilTimeMinutes: 60,
      preBoilVolumeL: 25,
      postBoilVolumeL: 21,
      whirlpoolTimeMinutes: 20,
      whirlpoolTemperatureC: 85,
      hopAdditions: [
        ...hops,
        { id: "mosaic-wp", name: "Mosaic", alphaAcidPercent: 12, weightG: 50, boilTimeMinutes: 20, use: "whirlpool", temperatureC: 85 },
        { id: "citra-dh", name: "Citra", alphaAcidPercent: 12, weightG: 80, boilTimeMinutes: 3, use: "dry_hop" }
      ]
    });

    expect(result.ibu).toBeGreaterThan(31.3);
    expect(result.contributions.some((contribution) => contribution.use === "whirlpool")).toBe(true);
    expect(result.warnings).toContain("dry_hop_ibu_ignored");
  });

  it("keeps alternative bitterness engines switchable", () => {
    const rager = calculateBitterness({ formula: "rager", og: 1.059, batchVolumeL: 20, hopAdditions: hops });
    const garetz = calculateBitterness({ formula: "garetz", og: 1.059, batchVolumeL: 20, hopAdditions: hops, altitudeM: 1200 });
    const noonan = calculateBitterness({ formula: "noonan_legacy", og: 1.059, batchVolumeL: 20, hopAdditions: hops });

    expect(rager.ibu).toBeGreaterThan(0);
    expect(garetz.formula).toBe("garetz");
    expect(garetz.warnings).toContain("garetz_conservative_compat_approximation");
    expect(noonan.formula).toBe("noonan_legacy");
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

    expect(sugar).toBe(123.2);
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
