import { z } from "zod";

export const ingredientTypeSchema = z.enum([
  "fermentable",
  "hop",
  "yeast",
  "sugar",
  "adjunct",
  "fining",
  "misc"
]);

const baseIngredientSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  notes: z.string().optional()
});

export const fermentableIngredientSchema = baseIngredientSchema.extend({
  type: z.literal("fermentable"),
  potentialPpg: z.number().positive(),
  colorLovibond: z.number().min(0),
  moisturePercent: z.number().min(0).max(100).optional(),
  isMashed: z.boolean().optional()
});

export const hopIngredientSchema = baseIngredientSchema.extend({
  type: z.literal("hop"),
  alphaAcidPercent: z.number().min(0).max(100),
  betaAcidPercent: z.number().min(0).max(100).optional(),
  form: z.enum(["pellet", "leaf", "plug"]).optional()
});

export const yeastIngredientSchema = baseIngredientSchema.extend({
  type: z.literal("yeast"),
  attenuationPercent: z.number().min(0).max(100),
  form: z.enum(["dry", "liquid"]).optional(),
  minTemperatureC: z.number().optional(),
  maxTemperatureC: z.number().optional()
});

export const sugarIngredientSchema = baseIngredientSchema.extend({
  type: z.literal("sugar"),
  fermentabilityPercent: z.number().min(0).max(100)
});

export const adjunctIngredientSchema = baseIngredientSchema.extend({
  type: z.literal("adjunct"),
  useStage: z.enum(["mash", "boil", "fermentation", "packaging"]).optional()
});

export const finingIngredientSchema = baseIngredientSchema.extend({
  type: z.literal("fining"),
  useStage: z.enum(["boil", "fermentation", "packaging"]).optional()
});

export const miscIngredientSchema = baseIngredientSchema.extend({
  type: z.literal("misc"),
  category: z.enum(["spice", "wood", "fruit", "water_treatment", "other"]).optional()
});

export const brewingIngredientSchema = z.discriminatedUnion("type", [
  fermentableIngredientSchema,
  hopIngredientSchema,
  yeastIngredientSchema,
  sugarIngredientSchema,
  adjunctIngredientSchema,
  finingIngredientSchema,
  miscIngredientSchema
]);
