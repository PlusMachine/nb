export interface FermentableGrainBillItem {
  id: string;
  name: string;
  weightKg: number;
  potentialPpg: number;
  colorLovibond: number;
  /**
   * Whether brewhouse/mash efficiency applies to this fermentable. Grain (incl.
   * unmalted adjuncts) must be mashed, so it converts at brewhouse efficiency.
   * Extract/sugar/syrup/honey/fruit dissolve fully → ~100%. Omitted/undefined =
   * applies efficiency (back-compatible with the previous uniform behaviour).
   */
  appliesBrewhouseEfficiency?: boolean;
}

export interface HopAdditionInput {
  id: string;
  name: string;
  alphaAcidPercent: number;
  weightG: number;
  boilTimeMinutes: number;
  use?: "boil" | "first_wort_hop" | "whirlpool" | "dry_hop" | "dip_hop" | "other";
  temperatureC?: number | null;
  utilizationFactor?: number | null;
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
