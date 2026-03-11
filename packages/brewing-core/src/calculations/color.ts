import { roundTo } from "../units";
import type { FermentableGrainBillItem } from "../types/recipe";

const KG_TO_LB = 2.2046226218;
const L_TO_GAL = 0.2641720524;

export const calculateMcu = (fermentables: FermentableGrainBillItem[], batchVolumeL: number): number => {
  const volumeGal = batchVolumeL * L_TO_GAL;
  const mcu = fermentables.reduce((sum, fermentable) => {
    const weightLb = fermentable.weightKg * KG_TO_LB;
    return sum + (weightLb * fermentable.colorLovibond) / volumeGal;
  }, 0);

  return roundTo(mcu, 2);
};

export const mcuToSrmMorey = (mcu: number): number => roundTo(1.4922 * mcu ** 0.6859, 1);

export const srmToEbc = (srm: number): number => roundTo(srm * 1.97, 1);

export const calculateColor = (fermentables: FermentableGrainBillItem[], batchVolumeL: number) => {
  const mcu = calculateMcu(fermentables, batchVolumeL);
  const srm = mcuToSrmMorey(mcu);
  const ebc = srmToEbc(srm);
  return { mcu, srm, ebc };
};
