import { z } from "zod";
import { GRAVITY_SG_MAX, GRAVITY_SG_MIN } from "./contracts";

export const manualTransferInputSchema = z.object({
  operationId: z.string().uuid(),
  takenAt: z.string().datetime({ offset: true }),
  gravitySg: z.number().finite().min(GRAVITY_SG_MIN).max(GRAVITY_SG_MAX).nullable(),
  fermenterL: z.number().finite().positive().max(10000).nullable()
}).refine(input => input.gravitySg !== null || input.fermenterL !== null, { message: "Введите хотя бы один замер." });
export type ManualTransferInput = z.infer<typeof manualTransferInputSchema>;
