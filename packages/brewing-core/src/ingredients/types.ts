export const INGREDIENT_TYPES = [
  "fermentable",
  "hop",
  "yeast",
  "sugar",
  "adjunct",
  "fining",
  "misc"
] as const;

export type IngredientType = (typeof INGREDIENT_TYPES)[number];

export interface BaseIngredient {
  id: string;
  name: string;
  type: IngredientType;
  notes?: string;
}

export interface FermentableIngredient extends BaseIngredient {
  type: "fermentable";
  potentialPpg: number;
  colorLovibond: number;
  moisturePercent?: number;
  isMashed?: boolean;
}

export interface HopIngredient extends BaseIngredient {
  type: "hop";
  alphaAcidPercent: number;
  betaAcidPercent?: number;
  form?: "pellet" | "leaf" | "plug";
}

export interface YeastIngredient extends BaseIngredient {
  type: "yeast";
  attenuationPercent: number;
  form?: "dry" | "liquid";
  minTemperatureC?: number;
  maxTemperatureC?: number;
}

export interface SugarIngredient extends BaseIngredient {
  type: "sugar";
  fermentabilityPercent: number;
}

export interface AdjunctIngredient extends BaseIngredient {
  type: "adjunct";
  useStage?: "mash" | "boil" | "fermentation" | "packaging";
}

export interface FiningIngredient extends BaseIngredient {
  type: "fining";
  useStage?: "boil" | "fermentation" | "packaging";
}

export interface MiscIngredient extends BaseIngredient {
  type: "misc";
  category?: "spice" | "wood" | "fruit" | "water_treatment" | "other";
}

export type BrewingIngredient =
  | FermentableIngredient
  | HopIngredient
  | YeastIngredient
  | SugarIngredient
  | AdjunctIngredient
  | FiningIngredient
  | MiscIngredient;
