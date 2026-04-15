import { z } from "zod";

export const brewBatchStatuses = ["planned", "brewing", "fermenting", "completed", "cancelled"] as const;
export type BrewBatchStatus = (typeof brewBatchStatuses)[number];

export const brewPlanSnapshotSchema = z.object({
  version: z.literal("brew_plan_v1"),
  recipe: z.object({
    id: z.string().uuid(),
    title: z.string(),
    versionNumber: z.number().int(),
    batchSizeL: z.number().nullable()
  }),
  equipmentProfileSnapshot: z.record(z.string(), z.unknown()).nullable(),
  waterPlanMeta: z.record(z.string(), z.unknown()).nullable(),
  mashSteps: z.array(z.record(z.string(), z.unknown())),
  boilPlan: z.object({
    boilTimeMinutes: z.number().int(),
    timedAdditions: z.array(z.record(z.string(), z.unknown()))
  }),
  whirlpoolPlan: z.array(z.record(z.string(), z.unknown())),
  fermentationPlan: z.record(z.string(), z.unknown()).nullable(),
  packagingPlan: z.record(z.string(), z.unknown()).nullable(),
  deviceHints: z.array(z.record(z.string(), z.unknown()))
});

export type BrewPlanSnapshot = z.infer<typeof brewPlanSnapshotSchema>;

export type BrewBatchDto = {
  id: string;
  userId: string;
  recipeId: string;
  status: BrewBatchStatus;
  name: string;
  brewPlanSnapshot: BrewPlanSnapshot;
  recipeSnapshot: Record<string, unknown> | null;
  equipmentProfileSnapshot: Record<string, unknown> | null;
  waterPlanSnapshot: Record<string, unknown> | null;
  deviceHints: Record<string, unknown>[];
  notes: string | null;
  plannedFor: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
