export interface FermentableGrainBillItem {
  id: string;
  name: string;
  weightKg: number;
  potentialPpg: number;
  colorLovibond: number;
}

export interface HopAdditionInput {
  id: string;
  name: string;
  alphaAcidPercent: number;
  weightG: number;
  boilTimeMinutes: number;
  use?: "boil" | "whirlpool" | "dry_hop";
}

export interface RecipeStats {
  og: number;
  fg: number;
  abv: number;
  ibu: number;
  srm: number;
  ebc: number;
}

export interface RecipeProcessInput {
  name: string;
  batchVolumeL: number;
  boilTimeMinutes: number;
  mashDurationMinutes?: number;
  mashRests?: Array<{ name: string; temperatureC: number; durationMinutes: number }>;
  hasSparge?: boolean;
  whirlpoolMinutes?: number;
  hopAdditions?: HopAdditionInput[];
  fermentationTemperatureC?: number;
}

export interface ScalableRecipe {
  batchVolumeL: number;
  fermentables: FermentableGrainBillItem[];
  hops: HopAdditionInput[];
}
