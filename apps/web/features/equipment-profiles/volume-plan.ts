import type { EquipmentProfileSnapshot } from "./contracts";

export type EquipmentVolumePlan = {
  fermenterTargetColdL: number;
  postBoilColdBeforeKettleLossL: number;
  postBoilHotL: number;
  preBoilHotL: number;
  grainAbsorptionLossL: number;
  totalWaterL: number;
  mashWaterL: number;
  spargeWaterL: number;
  warnings: string[];
};

export const calculateEquipmentVolumePlan = (
  profile: EquipmentProfileSnapshot,
  grainKg: number
): EquipmentVolumePlan => {
  const nonNegativeGrainKg = Math.max(0, grainKg);
  const boilTimeHr = profile.boilTimeMin / 60;
  const fermenterTargetColdL = profile.targetBatchVolumeL;
  const postBoilColdBeforeKettleLossL = fermenterTargetColdL + profile.trubChillerLossL;
  const postBoilHotL = postBoilColdBeforeKettleLossL / (1 - profile.coolingShrinkagePct / 100);
  const preBoilHotL = postBoilHotL + profile.evaporationRateLPerHr * boilTimeHr;
  const grainAbsorptionLossL = nonNegativeGrainKg * profile.grainAbsorptionLPerKg;
  const totalWaterL = Math.max(0, (
    preBoilHotL
    + grainAbsorptionLossL
    + profile.mashTunDeadspaceL
    + profile.spargeVesselDeadspaceL
    - profile.topUpWaterL
  ));
  const warnings: string[] = [];

  if (profile.maxKettleVolumeL != null && preBoilHotL > profile.maxKettleVolumeL) {
    warnings.push("kettle_volume_limit_exceeded");
  }

  if (profile.brewMethod === "biab_single_vessel") {
    const maxMashVolumeL = profile.maxMashVolumeL ?? profile.maxKettleVolumeL;
    const mashWaterL = maxMashVolumeL != null && totalWaterL > maxMashVolumeL
      ? maxMashVolumeL
      : totalWaterL;
    const spargeWaterL = totalWaterL - mashWaterL;

    if (spargeWaterL > 0) {
      warnings.push("mash_volume_limit_exceeded");
    }

    return {
      fermenterTargetColdL,
      postBoilColdBeforeKettleLossL,
      postBoilHotL,
      preBoilHotL,
      grainAbsorptionLossL,
      totalWaterL,
      mashWaterL,
      spargeWaterL,
      warnings
    };
  }

  const desiredMashWaterL = nonNegativeGrainKg * profile.mashThicknessLPerKg + profile.mashTunDeadspaceL;
  const maxMashWaterL = profile.maxMashVolumeL ?? desiredMashWaterL;
  const mashWaterL = Math.min(totalWaterL, Math.min(desiredMashWaterL, maxMashWaterL));

  if (desiredMashWaterL > maxMashWaterL) {
    warnings.push("mash_volume_limit_exceeded");
  }

  return {
    fermenterTargetColdL,
    postBoilColdBeforeKettleLossL,
    postBoilHotL,
    preBoilHotL,
    grainAbsorptionLossL,
    totalWaterL,
    mashWaterL,
    spargeWaterL: Math.max(0, totalWaterL - mashWaterL),
    warnings
  };
};
