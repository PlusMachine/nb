import { calculatePrimingSugar, residualCo2VolumesAtTempC } from "./calculator-tools";

export interface PrimingSugarInput {
  batchVolumeL: number;
  targetCo2Volumes: number;
  beerTemperatureC: number;
  sugarType?: "dextrose" | "sucrose" | "dme";
}

export const calculatePrimingSugarGrams = (input: PrimingSugarInput): number => {
  const result = calculatePrimingSugar({
    beerVolumeL: input.batchVolumeL,
    targetCo2Volumes: input.targetCo2Volumes,
    beerTemperatureC: input.beerTemperatureC,
    sugarType: input.sugarType ?? "dextrose"
  });

  return result.totalSugarGrams;
};

export { residualCo2VolumesAtTempC };
