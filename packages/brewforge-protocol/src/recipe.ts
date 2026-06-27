// =============================================================================
//  @nb/brewforge-protocol — recipe.ts
//  Нативный рецепт прошивки §6.1 (bf_recipe_t), пушится в записываемый слот.
//  Топик: brewforge/<deviceId>/recipe (крупное — через REST PUT /recipe).
//
//  doughInTempC / mashOut / boilTempC отсутствуют в портальном рецепте —
//  их ВЫЧИСЛЯЕТ устройство (Палмер + настройки §6.3). Поэтому nullable/optional.
//  Границы зеркалят bf_types.h: BF_NAME_LEN=32, BF_MAX_MASH_STEPS=8,
//  BF_MAX_HOPS=12, BF_MAX_HOP_STANDS=5.
// =============================================================================
import { z } from "zod";
import { PROTOCOL_SCHEMA_VERSION, UnitsSchema, WhirlpoolSchema } from "./enums.js";

const NameSchema = z.string().max(32); // BF_NAME_LEN (включая терминатор на стороне C)

/** bf_mash_step_t */
export const MashStepSchema = z.object({
  name: NameSchema,
  tempC: z.number(),
  timeMin: z.number().int().min(0),
});
export type MashStep = z.infer<typeof MashStepSchema>;

/** mash.mashOut — bf_recipe_t.mash_out_* (может быть null: устройство вычислит). */
export const MashOutSchema = z.object({
  tempC: z.number().nullable().optional(),
  timeMin: z.number().int().min(0),
});
export type MashOut = z.infer<typeof MashOutSchema>;

export const MashSchema = z.object({
  doughInTempC: z.number().nullable().optional(),
  pidDuringDoughIn: z.boolean(),
  steps: z.array(MashStepSchema).max(8), // BF_MAX_MASH_STEPS
  mashOut: MashOutSchema.nullable().optional(),
});
export type Mash = z.infer<typeof MashSchema>;

/** bf_hop_t */
export const HopSchema = z.object({
  name: NameSchema,
  amountG: z.number().min(0),
  atMinBeforeEnd: z.number().int().min(0),
});
export type Hop = z.infer<typeof HopSchema>;

export const BoilSchema = z.object({
  boilTimeMin: z.number().int().min(0),
  boilTempC: z.number().nullable().optional(),
  hops: z.array(HopSchema).max(12), // BF_MAX_HOPS
});
export type Boil = z.infer<typeof BoilSchema>;

/** bf_hop_stand_t */
export const HopStandSchema = z.object({
  tempC: z.number(),
  timeMin: z.number().int().min(0),
});
export type HopStand = z.infer<typeof HopStandSchema>;

export const CoolingSchema = z.object({
  targetC: z.number(),
});
export type Cooling = z.infer<typeof CoolingSchema>;

export const DeviceRecipeSchema = z.object({
  schema: z.literal(PROTOCOL_SCHEMA_VERSION),
  name: NameSchema,
  units: UnitsSchema,
  mash: MashSchema,
  boil: BoilSchema,
  hopStand: z.array(HopStandSchema).max(5), // BF_MAX_HOP_STANDS
  whirlpool: WhirlpoolSchema,
  cooling: CoolingSchema,
  beerxmlSource: z.string().nullable().optional(),
});
export type DeviceRecipe = z.infer<typeof DeviceRecipeSchema>;
