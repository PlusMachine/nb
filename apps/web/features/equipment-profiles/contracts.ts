import { z } from "zod";

const optionalNonNegativeNumber = z.coerce.number().min(0).optional().nullable();

export const equipmentProfilePayloadSchema = z.object({
  name: z.string().trim().min(1).max(180),
  targetBatchVolumeL: z.coerce.number().positive(),
  brewhouseEfficiencyPct: z.coerce.number().positive().max(100).default(75),
  evaporationRateLPerHr: z.coerce.number().min(0).default(3),
  trubChillerLossL: z.coerce.number().min(0).default(0),
  fermenterLossL: z.coerce.number().min(0).default(0),
  grainAbsorptionLPerKg: z.coerce.number().min(0).default(0.75),
  coolingShrinkagePct: z.coerce.number().min(0).max(20).default(4),
  mashThicknessLPerKg: z.coerce.number().positive().default(3),
  maxMashVolumeL: optionalNonNegativeNumber,
  maxKettleVolumeL: optionalNonNegativeNumber,
  hopUtilizationFactor: z.coerce.number().positive().default(1),
  altitudeM: z.coerce.number().min(-500).max(9000).default(0),
  notes: z.string().trim().max(6000).optional().nullable()
});

export const updateEquipmentProfilePayloadSchema = equipmentProfilePayloadSchema.partial();

export const equipmentProfileSnapshotSchema = equipmentProfilePayloadSchema.extend({
  id: z.string().uuid().nullable(),
  snapshotAt: z.string().datetime()
});

export type EquipmentProfilePayload = z.infer<typeof equipmentProfilePayloadSchema>;
export type UpdateEquipmentProfilePayload = z.infer<typeof updateEquipmentProfilePayloadSchema>;
export type EquipmentProfileSnapshot = z.infer<typeof equipmentProfileSnapshotSchema>;

export type EquipmentProfileDto = EquipmentProfilePayload & {
  id: string;
  userId: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export const starterEquipmentProfileDefaults: EquipmentProfilePayload = {
  name: "Профиль оборудования (1)",
  targetBatchVolumeL: 20,
  brewhouseEfficiencyPct: 70,
  evaporationRateLPerHr: 3,
  trubChillerLossL: 1,
  fermenterLossL: 0,
  grainAbsorptionLPerKg: 0.8,
  coolingShrinkagePct: 4,
  mashThicknessLPerKg: 3,
  maxMashVolumeL: null,
  maxKettleVolumeL: null,
  hopUtilizationFactor: 1,
  altitudeM: 0,
  notes: null
};
