import { z } from "zod";

export const brewStepTypeSchema = z.enum([
  "info",
  "confirmation",
  "timer",
  "measurement",
  "ingredient_addition",
  "transition"
]);

export const brewStageSchema = z.enum([
  "preparation",
  "mash",
  "lauter_sparge",
  "boil",
  "chill_transfer",
  "finish"
]);

export const brewStepSchema = z.object({
  id: z.string().min(1),
  type: brewStepTypeSchema,
  stage: brewStageSchema,
  title: z.string().min(1),
  instruction: z.string().min(1),
  durationSeconds: z.number().int().positive().nullable(),
  requiresConfirmation: z.boolean(),
  payload: z.unknown().optional(),
  meta: z.record(z.unknown()).optional()
});

export const brewStepsSchema = z.array(brewStepSchema);
