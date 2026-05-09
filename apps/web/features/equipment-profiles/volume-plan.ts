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
  grainKg: number,
  boilTimeMinutes = 60
): EquipmentVolumePlan => {
  const nonNegativeGrainKg = Math.max(0, grainKg);
  const boilTimeHr = Number.isFinite(boilTimeMinutes) && boilTimeMinutes > 0
    ? boilTimeMinutes / 60
    : 1;
  const fermenterTargetColdL = profile.targetBatchVolumeL;
  const postBoilColdBeforeKettleLossL = fermenterTargetColdL + profile.trubChillerLossL;
  const postBoilHotL = postBoilColdBeforeKettleLossL / (1 - profile.coolingShrinkagePct / 100);
  const preBoilHotL = postBoilHotL + profile.evaporationRateLPerHr * boilTimeHr;
  const grainAbsorptionLossL = nonNegativeGrainKg * profile.grainAbsorptionLPerKg;
  const totalWaterL = Math.max(0, (
    preBoilHotL
    + grainAbsorptionLossL
  ));
  const warnings: string[] = [];

  if (profile.maxKettleVolumeL != null && preBoilHotL > profile.maxKettleVolumeL) {
    warnings.push("kettle_volume_limit_exceeded");
  }

  const desiredMashWaterL = nonNegativeGrainKg * profile.mashThicknessLPerKg;
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
