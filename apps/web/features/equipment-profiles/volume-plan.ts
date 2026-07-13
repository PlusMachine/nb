import type { EquipmentProfileSnapshot } from "./contracts";

/** Что с чем не сошлось — чтобы предупреждение называло числа, а не просто ругалось. */
export type EquipmentVolumeLimits = {
  grainKg: number;
  maxGrainKg: number | null;
  maxMashVolumeL: number | null;
  minMashVolumeL: number | null;
  maxKettleVolumeL: number | null;
};

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
  limits: EquipmentVolumeLimits;
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

  // Мёртвый объём (вода под корзиной/фальшдном) в затирании не участвует, но залить
  // его надо — иначе солод не покрыт водой и фактический гидромодуль ниже расчётного.
  // В кипячение он уходит целиком, поэтому в totalWaterL не добавляется: это не потеря.
  const minMashWaterL = profile.minMashVolumeL ?? 0;
  const desiredMashWaterL = Math.max(
    nonNegativeGrainKg * profile.mashThicknessLPerKg + profile.mashTunDeadspaceL,
    minMashWaterL
  );
  const maxMashWaterL = profile.maxMashVolumeL ?? desiredMashWaterL;
  const mashWaterL = Math.min(totalWaterL, Math.min(desiredMashWaterL, maxMashWaterL));

  if (desiredMashWaterL > maxMashWaterL) {
    warnings.push("mash_volume_limit_exceeded");
  }

  // Воды не хватает даже на минимум по заторнику — у систем с ТЭНом на стенке это
  // означает оголённый ТЭН, а не просто густой затор.
  if (minMashWaterL > 0 && mashWaterL < minMashWaterL - 1e-6) {
    warnings.push("mash_below_min_volume");
  }

  // Солод не помещается в корзину/трубу. Ловится только здесь: по воде такой план
  // может выглядеть совершенно здоровым.
  if (profile.maxGrainKg != null && nonNegativeGrainKg > profile.maxGrainKg + 1e-6) {
    warnings.push("grain_bill_limit_exceeded");
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
    warnings,
    limits: {
      grainKg: nonNegativeGrainKg,
      maxGrainKg: profile.maxGrainKg ?? null,
      maxMashVolumeL: profile.maxMashVolumeL ?? null,
      minMashVolumeL: profile.minMashVolumeL ?? null,
      maxKettleVolumeL: profile.maxKettleVolumeL ?? null
    }
  };
};
