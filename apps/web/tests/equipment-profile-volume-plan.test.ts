import { describe, expect, it } from "vitest";

import type { EquipmentProfileSnapshot } from "../features/equipment-profiles/contracts";
import { calculateEquipmentVolumePlan } from "../features/equipment-profiles/volume-plan";

const baseProfile: EquipmentProfileSnapshot = {
  id: "00000000-0000-4000-8000-000000000301",
  name: "Test BIAB",
  brewMethod: "biab_single_vessel",
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

describe("equipment volume plan", () => {
  it("builds canonical fermenter-target volume ladder", () => {
    const plan = calculateEquipmentVolumePlan(baseProfile, 5);

    expect(plan.fermenterTargetColdL).toBe(20);
    expect(plan.postBoilColdBeforeKettleLossL).toBe(21);
    expect(plan.postBoilHotL).toBeCloseTo(21.875, 3);
    expect(plan.preBoilHotL).toBeCloseTo(24.875, 3);
    expect(plan.grainAbsorptionLossL).toBe(3.75);
    expect(plan.totalWaterL).toBeCloseTo(28.625, 3);
    expect(plan.mashWaterL).toBeCloseTo(28.625, 3);
    expect(plan.spargeWaterL).toBe(0);
  });

  it("moves excess BIAB water to sparge when vessel limit is exceeded", () => {
    const plan = calculateEquipmentVolumePlan({ ...baseProfile, maxMashVolumeL: 25 }, 5);

    expect(plan.mashWaterL).toBe(25);
    expect(plan.spargeWaterL).toBeCloseTo(3.625, 3);
    expect(plan.warnings).toContain("mash_volume_limit_exceeded");
  });
});
