export type WeightUnit = "g" | "kg" | "oz" | "lb";
export type VolumeUnit = "ml" | "l" | "gal";
export type TemperatureUnit = "c" | "f";
export type GravityUnit = "sg" | "plato";
export type TimeUnit = "sec" | "min";

export type UnitKind = "weight" | "volume" | "temperature" | "gravity" | "time";

export type Measurement<U extends string> = {
  value: number;
  unit: U;
};

export type Weight = Measurement<WeightUnit>;
export type Volume = Measurement<VolumeUnit>;
export type Temperature = Measurement<TemperatureUnit>;
export type Gravity = Measurement<GravityUnit>;
export type Time = Measurement<TimeUnit>;

export const CANONICAL_UNITS = {
  weight: "g",
  volume: "l",
  temperature: "c",
  gravity: "sg",
  time: "sec"
} as const;
