import { describe, expect, it } from "vitest";

import type { EquipmentProfileSnapshot } from "../features/equipment-profiles/contracts";
import { calculateEquipmentVolumePlan } from "../features/equipment-profiles/volume-plan";

const baseProfile: EquipmentProfileSnapshot = {
  id: "00000000-0000-4000-8000-000000000301",
  name: "Test BIAB",
  targetBatchVolumeL: 20,
  brewhouseEfficiencyPct: 75,
  evaporationRateLPerHr: 3,
  trubChillerLossL: 1,
  fermenterLossL: 0,
  grainAbsorptionLPerKg: 0.75,
  coolingShrinkagePct: 4,
  mashThicknessLPerKg: 3,
  mashTunDeadspaceL: 0,
  minMashVolumeL: null,
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
    expect(plan.mashWaterL).toBe(15);
    expect(plan.spargeWaterL).toBeCloseTo(13.625, 3);
  });

  it("warns when desired mash water exceeds the mash vessel limit", () => {
    const plan = calculateEquipmentVolumePlan({ ...baseProfile, maxMashVolumeL: 12 }, 5);

    expect(plan.mashWaterL).toBe(12);
    expect(plan.spargeWaterL).toBeCloseTo(16.625, 3);
    expect(plan.warnings).toContain("mash_volume_limit_exceeded");
  });

  it("uses recipe boil time for boil-off losses", () => {
    const plan = calculateEquipmentVolumePlan(baseProfile, 5, 90);

    expect(plan.preBoilHotL).toBeCloseTo(26.375, 3);
    expect(plan.totalWaterL).toBeCloseTo(30.125, 3);
  });
});
