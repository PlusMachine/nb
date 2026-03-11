import type {
  Gravity,
  GravityUnit,
  Temperature,
  TemperatureUnit,
  Time,
  TimeUnit,
  Volume,
  VolumeUnit,
  Weight,
  WeightUnit
} from "./types";

const WEIGHT_FACTORS_TO_GRAMS: Record<WeightUnit, number> = {
  g: 1,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237
};

const VOLUME_FACTORS_TO_LITERS: Record<VolumeUnit, number> = {
  ml: 0.001,
  l: 1,
  gal: 3.785411784
};

const TIME_FACTORS_TO_SECONDS: Record<TimeUnit, number> = {
  sec: 1,
  min: 60
};

export const roundTo = (value: number, decimals = 3): number => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const assertFinite = (value: number, label: string): void => {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
};

export const convertWeight = (input: Weight, to: WeightUnit, decimals = 3): Weight => {
  assertFinite(input.value, "Weight value");
  const grams = input.value * WEIGHT_FACTORS_TO_GRAMS[input.unit];
  return { value: roundTo(grams / WEIGHT_FACTORS_TO_GRAMS[to], decimals), unit: to };
};

export const convertVolume = (input: Volume, to: VolumeUnit, decimals = 3): Volume => {
  assertFinite(input.value, "Volume value");
  const liters = input.value * VOLUME_FACTORS_TO_LITERS[input.unit];
  return { value: roundTo(liters / VOLUME_FACTORS_TO_LITERS[to], decimals), unit: to };
};

export const convertTime = (input: Time, to: TimeUnit, decimals = 3): Time => {
  assertFinite(input.value, "Time value");
  const seconds = input.value * TIME_FACTORS_TO_SECONDS[input.unit];
  return { value: roundTo(seconds / TIME_FACTORS_TO_SECONDS[to], decimals), unit: to };
};

export const convertTemperature = (
  input: Temperature,
  to: TemperatureUnit,
  decimals = 2
): Temperature => {
  assertFinite(input.value, "Temperature value");
  if (input.unit === to) {
    return { value: roundTo(input.value, decimals), unit: to };
  }

  if (input.unit === "c") {
    return { value: roundTo((input.value * 9) / 5 + 32, decimals), unit: "f" };
  }

  return { value: roundTo(((input.value - 32) * 5) / 9, decimals), unit: "c" };
};

export const sgToPlato = (sg: number, decimals = 2): number => {
  assertFinite(sg, "SG value");
  const plato = -616.868 + 1111.14 * sg - 630.272 * sg ** 2 + 135.997 * sg ** 3;
  return roundTo(plato, decimals);
};

export const platoToSg = (plato: number, decimals = 4): number => {
  assertFinite(plato, "Plato value");
  const sg = 1 + plato / (258.6 - (plato / 258.2) * 227.1);
  return roundTo(sg, decimals);
};

export const convertGravity = (input: Gravity, to: GravityUnit): Gravity => {
  if (input.unit === to) {
    return { ...input };
  }

  if (input.unit === "sg") {
    return { value: sgToPlato(input.value), unit: "plato" };
  }

  return { value: platoToSg(input.value), unit: "sg" };
};
