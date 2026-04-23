import { describe, expect, it } from "vitest";

import { buildRecipeWaterPlanResult } from "../features/recipes/water-plan";

describe("recipe water plan result", () => {
  it("uses batch size volume and solves salts plus mash acid", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
      beerSrm: 8,
      fermentables: [
        { name: "Pale Malt", subtype: "malt", weightKg: 4.5 },
        { name: "Caramel 60", subtype: "crystal", weightKg: 0.5 },
      ],
      waterPlanMeta: {
        setupEnabled: true,
        engine: "balanced_default",
        phModel: "hybrid_mash_ph_v1",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: {
          ca: 20,
          mg: 5,
          na: 10,
          cl: 20,
          so4: 30,
          hco3: 90,
          ph: 7.6,
        },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: {
          ca: 80,
          mg: 10,
          na: 15,
          cl: 90,
          so4: 150,
          hco3: 70,
          ph: null,
        },
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: null,
        spargeWaterVolumeL: null,
        totalWaterVolumeL: null,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [],
        targetMashPh: 5.35,
        spargeAcidificationEnabled: true,
        spargeSourcePh: 7.6,
        targetSpargePh: null,
        targetSpargeAlkalinity: null,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: 88,
        calibrationOffset: null,
      },
    });

    expect(result.waterVolumes.source).toBe("batch_size");
    expect(result.waterVolumes.totalWaterL).toBe(20);
    expect(result.waterVolumes.mashWaterL).toBe(20);
    expect(result.waterVolumes.spargeWaterL).toBe(0);
    expect(result.totalSaltAdditions.length).toBeGreaterThan(0);
    expect(result.finalProfile.ca).toBeGreaterThan(20);
    expect(result.mashPhEstimate?.model).toBe("hybrid_mash_ph_v1");
    expect(result.mashAcidAddition?.label).toBe("Молочная кислота");
    expect(result.mashAcidAddition?.mashAcidMl).toBeGreaterThanOrEqual(0);
    expect(result.spargeAcidAddition).toBeNull();
    expect(result.predictedMashPhAfterAcid20C).toBeLessThanOrEqual(
      result.mashPhEstimate?.predictedMashPh20C ?? 99,
    );
  });

  it("uses manual mash/sparge split and skips pH when target mash pH is not set", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 12,
      grainKg: 3,
      waterPlanMeta: {
        setupEnabled: false,
        engine: "balanced_default",
        phModel: "kolbach_ra_quick",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: {
          ca: 15,
          mg: 3,
          na: 8,
          cl: 18,
          so4: 25,
          hco3: 40,
          ph: null,
        },
        targetProfileMode: "balanced",
        targetProfilePresetId: null,
        targetProfile: null,
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: 8,
        spargeWaterVolumeL: 4,
        totalWaterVolumeL: null,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [],
        targetMashPh: null,
        spargeAcidificationEnabled: false,
        spargeSourcePh: null,
        targetSpargePh: null,
        targetSpargeAlkalinity: null,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: null,
        calibrationOffset: null,
      },
    });

    expect(result.waterVolumes.source).toBe("manual_split");
    expect(result.waterVolumes.totalWaterL).toBe(12);
    expect(result.waterVolumes.mashWaterL).toBe(8);
    expect(result.waterVolumes.spargeWaterL).toBe(4);
    expect(result.engine).toBe("profile_only");
    expect(result.mashPhEstimate).toBeNull();
    expect(result.mashAcidAddition).toBeNull();
  });

  it("does not auto-solve salts in manual additions mode when no manual salts are entered", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
      beerSrm: 8,
      fermentables: [
        { name: "Pale Malt", subtype: "malt", weightKg: 4.5 },
        { name: "Caramel 60", subtype: "crystal", weightKg: 0.5 },
      ],
      waterPlanMeta: {
        setupEnabled: true,
        engine: "advanced_manual",
        phModel: "hybrid_mash_ph_v1",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: {
          ca: 20,
          mg: 5,
          na: 10,
          cl: 20,
          so4: 30,
          hco3: 90,
          ph: 7.6,
        },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: {
          ca: 80,
          mg: 10,
          na: 15,
          cl: 90,
          so4: 150,
          hco3: 70,
          ph: null,
        },
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: null,
        spargeWaterVolumeL: null,
        totalWaterVolumeL: null,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [],
        targetMashPh: 5.35,
        spargeAcidificationEnabled: false,
        spargeSourcePh: null,
        targetSpargePh: null,
        targetSpargeAlkalinity: null,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: 88,
        calibrationOffset: null,
      },
    });

    expect(result.totalSaltAdditions).toEqual([]);
    expect(result.finalProfile.ca).toBe(20);
    expect(result.finalProfile.so4).toBe(30);
    expect(result.mashPhEstimate?.model).toBe("hybrid_mash_ph_v1");
  });
});
