import { roundTo } from "../units";

export interface PrimingSugarInput {
  batchVolumeL: number;
  targetCo2Volumes: number;
  beerTemperatureC: number;
  sugarType?: "dextrose" | "sucrose" | "dme";
}

const sugarFactors: Record<NonNullable<PrimingSugarInput["sugarType"]>, number> = {
  dextrose: 4.0,
  sucrose: 3.8,
  dme: 5.6
};

const residualCo2VolumesAtTempC = (temperatureC: number): number => {
  // Practical quadratic approximation for residual CO2 in beer by temperature.
  return 3.0378 - 0.050062 * temperatureC + 0.00026555 * temperatureC ** 2;
};

export const calculatePrimingSugarGrams = (input: PrimingSugarInput): number => {
  const sugarType = input.sugarType ?? "dextrose";
  const residual = residualCo2VolumesAtTempC(input.beerTemperatureC);
  const deltaVolumes = Math.max(input.targetCo2Volumes - residual, 0);
  return roundTo(input.batchVolumeL * deltaVolumes * sugarFactors[sugarType], 1);
};
