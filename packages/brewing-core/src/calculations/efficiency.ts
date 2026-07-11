import { roundTo } from "../units";
import type { FermentableGrainBillItem } from "../types/recipe";
import { calculateOg, KG_TO_LB, L_TO_GAL } from "./gravity";

export interface EstimateBrewhouseEfficiencyInput {
  fermentables: FermentableGrainBillItem[];
  batchVolumeL: number;
  measuredOg: number;
}

export interface EstimateBrewhouseEfficiencyResult {
  efficiencyPercent: number;
  grainPotentialPoints: number;
  warnings: string[];
}

/**
 * Inverse of calculateOg: given a measured OG, back out the brewhouse efficiency that
 * would have produced it. Fermentables with appliesBrewhouseEfficiency === false
 * (extract/sugar/honey) dissolve at ~100% regardless of mash efficiency, so their
 * point contribution is subtracted before dividing by the grain bill's full potential.
 */
export const estimateBrewhouseEfficiency = (input: EstimateBrewhouseEfficiencyInput): EstimateBrewhouseEfficiencyResult => {
  const warnings: string[] = [];
  const grainItems = input.fermentables.filter((item) => item.appliesBrewhouseEfficiency !== false);
  const fullDissolutionItems = input.fermentables.filter((item) => item.appliesBrewhouseEfficiency === false);

  const grainPotentialPoints = grainItems.reduce((sum, item) => sum + item.weightKg * KG_TO_LB * item.potentialPpg, 0);
  const fullDissolutionPoints = fullDissolutionItems.reduce((sum, item) => sum + item.weightKg * KG_TO_LB * item.potentialPpg, 0);

  if (grainItems.length === 0) {
    warnings.push("no_grain_bill");
  } else if (grainPotentialPoints <= 0) {
    // Зерновые позиции есть, но их суммарный потенциал — ноль (например, "Другое" с не
    // заполненным PPG): делить на него нельзя, а no_grain_bill звучал бы неточно — засыпь
    // формально не пуста, просто её вклад не задан.
    warnings.push("no_grain_potential");
  }
  if (input.measuredOg <= 1) {
    warnings.push("no_measured_points");
  }

  // Любое из условий делает деление бессмысленным (нулевой делитель) — бэйлаутим до
  // арифметики, которая иначе дала бы NaN/Infinity.
  if (grainItems.length === 0 || grainPotentialPoints <= 0 || input.measuredOg <= 1) {
    return {
      efficiencyPercent: 0,
      grainPotentialPoints: roundTo(grainPotentialPoints, 1),
      warnings
    };
  }

  const batchGallons = input.batchVolumeL * L_TO_GAL;
  const measuredPoints = (input.measuredOg - 1) * 1000 * batchGallons;
  const rawGrainDerivedPoints = measuredPoints - fullDissolutionPoints;
  // Замеренная OG ниже вклада одних экстрактов/сахара — зерно тогда "участвует
  // отрицательно", что физически бессмысленно. Клампим в 0 вместо отрицательного
  // процента и не эскалируем отдельно как "низкая эффективность" — причина другая.
  const measuredBelowFullDissolution = rawGrainDerivedPoints < 0;
  const grainDerivedPoints = Math.max(0, rawGrainDerivedPoints);
  const efficiencyPercent = roundTo((grainDerivedPoints / grainPotentialPoints) * 100, 1);

  if (efficiencyPercent > 100) {
    warnings.push("efficiency_above_100");
  }
  if (measuredBelowFullDissolution) {
    warnings.push("measured_og_below_extras");
  } else if (efficiencyPercent < 50) {
    warnings.push("efficiency_low");
  }

  return {
    efficiencyPercent,
    grainPotentialPoints: roundTo(grainPotentialPoints, 1),
    warnings
  };
};

export interface PredictOgAtEfficiencyInput {
  fermentables: FermentableGrainBillItem[];
  batchVolumeL: number;
  brewhouseEfficiencyPercent: number;
}

/** Thin wrapper over calculateOg — kept here so efficiency calculators share one entry point. */
export const predictOgAtEfficiency = (input: PredictOgAtEfficiencyInput): number => calculateOg(input);

export interface FermentablePpgPreset {
  key: string;
  ppg: number;
  appliesBrewhouseEfficiency: boolean;
}

export const FERMENTABLE_PPG_PRESETS: FermentablePpgPreset[] = [
  { key: "base_malt", ppg: 37, appliesBrewhouseEfficiency: true },
  { key: "wheat_malt", ppg: 38, appliesBrewhouseEfficiency: true },
  { key: "munich", ppg: 35, appliesBrewhouseEfficiency: true },
  { key: "crystal", ppg: 34, appliesBrewhouseEfficiency: true },
  { key: "roasted", ppg: 25, appliesBrewhouseEfficiency: true },
  { key: "flaked_adjunct", ppg: 32, appliesBrewhouseEfficiency: true },
  { key: "sugar", ppg: 46, appliesBrewhouseEfficiency: false },
  { key: "dme", ppg: 44, appliesBrewhouseEfficiency: false },
  { key: "lme", ppg: 36, appliesBrewhouseEfficiency: false },
  { key: "honey", ppg: 35, appliesBrewhouseEfficiency: false }
];
