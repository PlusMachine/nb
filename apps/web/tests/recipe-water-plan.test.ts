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

  it("scopes manual salt additions to all water, mash or sparge", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
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
        targetProfile: null,
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: 12,
        spargeWaterVolumeL: 8,
        totalWaterVolumeL: null,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [
          { salt: "gypsum", grams: 4, target: "all" },
          { salt: "calcium_chloride", grams: 3, target: "mash" },
          { salt: "epsom_salt", grams: 2, target: "sparge" },
        ],
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
    const grams = (
      items: typeof result.mashSaltAdditions,
      salt: string,
    ) => items.find((addition) => addition.salt === salt)?.grams ?? 0;

    expect(grams(result.mashSaltAdditions, "gypsum")).toBeCloseTo(2.4, 2);
    expect(grams(result.spargeSaltAdditions, "gypsum")).toBeCloseTo(1.6, 2);
    expect(grams(result.mashSaltAdditions, "calcium_chloride")).toBe(3);
    expect(grams(result.spargeSaltAdditions, "calcium_chloride")).toBe(0);
    expect(grams(result.mashSaltAdditions, "epsom_salt")).toBe(0);
    expect(grams(result.spargeSaltAdditions, "epsom_salt")).toBe(2);
    expect(result.totalSaltAdditions.map((addition) => addition.target)).toEqual([
      "all",
      "mash",
      "sparge",
    ]);
  });

  it("does not include baking soda in auto salts by default", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
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
          hco3: 60,
          ph: 7.6,
        },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: {
          ca: 80,
          mg: 10,
          na: 80,
          cl: 90,
          so4: 150,
          hco3: 160,
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

    expect(result.totalSaltAdditions.map((addition) => addition.salt)).not.toContain(
      "baking_soda",
    );
    expect(result.finalProfile.hco3).toBe(60);
  });

  it("includes baking soda in auto salts only when explicitly enabled", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
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
          hco3: 60,
          ph: 7.6,
        },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: {
          ca: 80,
          mg: 10,
          na: 80,
          cl: 90,
          so4: 150,
          hco3: 160,
          ph: null,
        },
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: null,
        spargeWaterVolumeL: null,
        totalWaterVolumeL: null,
        allowedSalts: [
          "gypsum",
          "calcium_chloride",
          "epsom_salt",
          "baking_soda",
        ],
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

    expect(result.totalSaltAdditions.map((addition) => addition.salt)).toContain(
      "baking_soda",
    );
    expect(result.finalProfile.na).toBeGreaterThan(10);
    expect(result.finalProfile.hco3).toBeGreaterThan(60);
    expect(result.finalProfile.na).toBeLessThanOrEqual(80.01);
    expect(result.finalProfile.hco3).toBeLessThanOrEqual(160.01);
  });

  it("uses equipment water requirements when an equipment volume plan is available", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      equipmentVolumePlan: {
        totalWaterL: 28.625,
        mashWaterL: 15,
        spargeWaterL: 13.625,
      },
      grainKg: 5,
      beerSrm: 8,
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
        spargeAcidificationEnabled: false,
        spargeSourcePh: null,
        targetSpargePh: null,
        targetSpargeAlkalinity: null,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: 88,
        calibrationOffset: null,
      },
    });

    expect(result.waterVolumes.source).toBe("equipment_profile");
    expect(result.waterVolumes.totalWaterL).toBeCloseTo(28.63, 2);
    expect(result.waterVolumes.suggestedMashWaterL).toBe(15);
    expect(result.waterVolumes.suggestedSpargeWaterL).toBeCloseTo(13.63, 2);
    expect(result.warnings).not.toContain("water_split_below_batch_volume");
  });

  it("allows manual mash and sparge water to exceed batch size", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
      waterPlanMeta: {
        setupEnabled: true,
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
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: {
          ca: 50,
          mg: 5,
          na: 10,
          cl: 70,
          so4: 90,
          hco3: 40,
          ph: null,
        },
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: 17,
        spargeWaterVolumeL: 12,
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
    expect(result.waterVolumes.totalWaterL).toBe(29);
    expect(result.waterVolumes.mashWaterL).toBe(17);
    expect(result.waterVolumes.spargeWaterL).toBe(12);
    expect(result.warnings).not.toContain("water_split_below_batch_volume");
  });

  it("warns only when manual mash and sparge water are below batch size", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
      waterPlanMeta: {
        setupEnabled: true,
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
        targetProfileMode: "manual",
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

    expect(result.waterVolumes.totalWaterL).toBe(12);
    expect(result.warnings).toContain("water_split_below_batch_volume");
  });

  it("allows sparge acidification without mash pH correction", () => {
    const result = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
      waterPlanMeta: {
        setupEnabled: true,
        engine: "profile_only",
        phModel: "hybrid_mash_ph_v1",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: {
          ca: 15,
          mg: 3,
          na: 8,
          cl: 18,
          so4: 25,
          hco3: 90,
          ph: 7.6,
        },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: {
          ca: 50,
          mg: 5,
          na: 10,
          cl: 70,
          so4: 90,
          hco3: 40,
          ph: null,
        },
        showWaterAdditivesInIngredients: false,
        blendRatio: null,
        mashWaterVolumeL: 13,
        spargeWaterVolumeL: 7,
        totalWaterVolumeL: null,
        allowedSalts: [],
        allowedAcids: [],
        manualSaltAdditions: [],
        targetMashPh: null,
        spargeAcidificationEnabled: true,
        spargeSourcePh: 7.6,
        targetSpargePh: 5.7,
        targetSpargeAlkalinity: null,
        selectedAcid: "lactic_acid",
        acidConcentrationPct: 88,
        calibrationOffset: null,
      },
    });

    expect(result.mashPhEstimate).toBeNull();
    expect(result.mashAcidAddition).toBeNull();
    expect(result.spargeAcidAddition?.spargeAcidMl).toBeGreaterThan(0);
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
