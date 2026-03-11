import { roundTo } from "../units";

const correctionPolynomial = (tempF: number): number => {
  return 1.00130346 - 0.000134722124 * tempF + 0.00000204052596 * tempF ** 2 - 0.00000000232820948 * tempF ** 3;
};

export interface HydrometerCorrectionInput {
  observedSg: number;
  sampleTemperatureC: number;
  calibrationTemperatureC?: number;
}

export const correctHydrometerReading = ({
  observedSg,
  sampleTemperatureC,
  calibrationTemperatureC = 20
}: HydrometerCorrectionInput): number => {
  const sampleF = (sampleTemperatureC * 9) / 5 + 32;
  const calibrationF = (calibrationTemperatureC * 9) / 5 + 32;
  const corrected = observedSg * (correctionPolynomial(sampleF) / correctionPolynomial(calibrationF));
  return roundTo(corrected, 3);
};
