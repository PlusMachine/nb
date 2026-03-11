import { roundTo } from "../units";
import type { HopAdditionInput } from "../types/recipe";

export interface IbuTinsethInput {
  og: number;
  batchVolumeL: number;
  hopAdditions: HopAdditionInput[];
}

const utilizationTinseth = (og: number, boilTimeMinutes: number): number => {
  const bignessFactor = 1.65 * 0.000125 ** (og - 1);
  const boilTimeFactor = (1 - Math.exp(-0.04 * boilTimeMinutes)) / 4.15;
  return bignessFactor * boilTimeFactor;
};

export const calculateIbuTinseth = ({ og, batchVolumeL, hopAdditions }: IbuTinsethInput): number => {
  const totalIbu = hopAdditions
    .filter((addition) => (addition.use ?? "boil") === "boil")
    .reduce((sum, addition) => {
      const alphaAcid = addition.alphaAcidPercent / 100;
      const utilization = utilizationTinseth(og, addition.boilTimeMinutes);
      const ibu = (addition.weightG * alphaAcid * utilization * 1000) / batchVolumeL;
      return sum + ibu;
    }, 0);

  return roundTo(totalIbu, 1);
};
