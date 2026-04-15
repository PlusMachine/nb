import { describe, expect, it } from "vitest";

import type { EquipmentProfileSnapshot } from "../features/equipment-profiles/contracts";
import { buildRecipeWaterPlanResult } from "../features/recipes/water-plan";

const equipmentProfile: EquipmentProfileSnapshot = {
  id: "00000000-0000-4000-8000-000000000301",
  name: "Test BIAB",
  brewMethod: "biab_single_vessel",
  batchTargetType: "fermenter",
  targetBatchVolumeL: 20,
  boilTimeMin: 60,
  brewhouseEfficiencyPct: 75,
  mashEfficiencyPct: null,
  evaporationRateLPerHr: 3,
  trubChillerLossL: 1,
  fermenterLossL: 0,
  mashTunDeadspaceL: 0,
  spargeVesselDeadspaceL: 0,
  grainAbsorptionLPerKg: 0.75,
  coolingShrinkagePct: 4,
  topUpWaterL: 0,
  mashThicknessLPerKg: 3,
  maxMashVolumeL: null,
  maxKettleVolumeL: null,
  hopUtilizationFactor: 1,
  altitudeM: 0,
  notes: null,
  snapshotAt: "2026-01-01T00:00:00.000Z"
};

describe("recipe water plan result", () => {
  it("derives water volumes from equipment and solves salts plus mash acid", () => {
    const result = buildRecipeWaterPlanResult({
      equipmentProfileSnapshot: { ...equipmentProfile, maxMashVolumeL: 20 },
      grainKg: 5,
      beerSrm: 8,
      fermentables: [
        { name: "Pale Malt", subtype: "malt", weightKg: 4.5 },
        { name: "Caramel 60", subtype: "crystal", weightKg: 0.5 }
      ],
      waterPlanMeta: {
        setupEnabled: true,
        engine: "balanced_default",
        phModel: "hybrid_mash_ph_v1",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: { ca: 20, mg: 5, na: 10, cl: 20, so4: 30, hco3: 90, ph: 7.6 },
        targetProfileMode: "manual",
        targetProfilePresetId: null,
        targetProfile: { ca: 80, mg: 10, na: 15, cl: 90, so4: 150, hco3: 70, ph: null },
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
        calibrationOffset: null
      }
    });

    expect(result.waterVolumes.source).toBe("equipment_profile");
    expect(result.waterVolumes.totalWaterL).toBeCloseTo(28.63, 1);
    expect(result.totalSaltAdditions.length).toBeGreaterThan(0);
    expect(result.finalProfile.ca).toBeGreaterThan(20);
    expect(result.mashPhEstimate?.model).toBe("hybrid_mash_ph_v1");
    expect(result.mashAcidAddition?.mashAcidMl).toBeGreaterThanOrEqual(0);
    expect(result.spargeAcidAddition?.spargeAcidMl).toBeGreaterThanOrEqual(0);
    expect(result.predictedMashPhAfterAcid20C).toBeLessThanOrEqual(result.mashPhEstimate?.predictedMashPh20C ?? 99);
  });

  it("uses starter equipment profile and skips pH in profile-only mode", () => {
    const result = buildRecipeWaterPlanResult({
      equipmentProfileSnapshot: null,
      fallbackBatchVolumeL: 12,
      grainKg: 3,
      waterPlanMeta: {
        setupEnabled: false,
        engine: "profile_only",
        phModel: "kolbach_ra_quick",
        sourceProfileMode: "manual",
        sourceProfilePresetId: null,
        sourceProfile: { ca: 15, mg: 3, na: 8, cl: 18, so4: 25, hco3: 40, ph: null },
        targetProfileMode: "balanced",
        targetProfilePresetId: null,
        targetProfile: null,
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
        acidConcentrationPct: null,
        calibrationOffset: null
      }
    });

    expect(result.waterVolumes.source).toBe("starter_profile");
    expect(result.volumePlan.fermenterTargetColdL).toBe(12);
    expect(result.mashPhEstimate).toBeNull();
    expect(result.mashAcidAddition).toBeNull();
    expect(result.warnings).toContain("equipment_profile_missing_using_starter");
  });
});
