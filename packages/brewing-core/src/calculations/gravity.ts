import { roundTo } from "../units";
import type { FermentableGrainBillItem } from "../types/recipe";

// Exported so other modules (e.g. efficiency.ts) reuse the same conversion constants
// instead of duplicating them.
export const KG_TO_LB = 2.2046226218;
export const L_TO_GAL = 0.2641720524;

export interface OgInput {
  fermentables: FermentableGrainBillItem[];
  batchVolumeL: number;
  brewhouseEfficiencyPercent: number;
}

export const calculateOg = ({ fermentables, batchVolumeL, brewhouseEfficiencyPercent }: OgInput): number => {
  const batchGallons = batchVolumeL * L_TO_GAL;
  const effectivePoints = fermentables.reduce((sum, fermentable) => {
    const pounds = fermentable.weightKg * KG_TO_LB;
    // Grain converts at brewhouse efficiency; extract/sugar/syrup/honey dissolve
    // fully (~100%). Default (field omitted) keeps the legacy uniform behaviour.
    const efficiencyPercent = fermentable.appliesBrewhouseEfficiency === false ? 100 : brewhouseEfficiencyPercent;
    return sum + pounds * fermentable.potentialPpg * (efficiencyPercent / 100);
  }, 0);

  const og = 1 + effectivePoints / (batchGallons * 1000);

  return roundTo(og, 3);
};

export interface FgInput {
  og: number;
  attenuationPercent: number;
}

export const calculateFg = ({ og, attenuationPercent }: FgInput): number => {
  const gravityPoints = (og - 1) * 1000;
  const remainingPoints = gravityPoints * (1 - attenuationPercent / 100);
  return roundTo(1 + remainingPoints / 1000, 3);
};

export const calculateAbv = (og: number, fg: number): number => roundTo((og - fg) * 131.25, 2);
