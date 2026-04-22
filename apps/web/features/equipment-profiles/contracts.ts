import { z } from "zod";

export const equipmentBrewMethods = [
  "biab_single_vessel",
  "mash_sparge_two_vessel",
  "three_vessel",
  "extract_partial_boil"
] as const;

export type EquipmentBrewMethod = (typeof equipmentBrewMethods)[number];

const optionalNonNegativeNumber = z.coerce.number().min(0).optional().nullable();

export const equipmentProfilePayloadSchema = z.object({
  name: z.string().trim().min(1).max(180),
  brewMethod: z.enum(equipmentBrewMethods).default("biab_single_vessel"),
  targetBatchVolumeL: z.coerce.number().positive(),
  boilTimeMin: z.coerce.number().int().min(1).max(600).default(60),
  brewhouseEfficiencyPct: z.coerce.number().positive().max(100).default(75),
  mashEfficiencyPct: z.coerce.number().positive().max(100).optional().nullable(),
  evaporationRateLPerHr: z.coerce.number().min(0).default(3),
  trubChillerLossL: z.coerce.number().min(0).default(0),
  fermenterLossL: z.coerce.number().min(0).default(0),
  mashTunDeadspaceL: z.coerce.number().min(0).default(0),
  spargeVesselDeadspaceL: z.coerce.number().min(0).default(0),
  grainAbsorptionLPerKg: z.coerce.number().min(0).default(0.75),
  coolingShrinkagePct: z.coerce.number().min(0).max(20).default(4),
  topUpWaterL: z.coerce.number().min(0).default(0),
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
  brewMethod: "mash_sparge_two_vessel",
  targetBatchVolumeL: 20,
  boilTimeMin: 60,
  brewhouseEfficiencyPct: 70,
  mashEfficiencyPct: null,
  evaporationRateLPerHr: 3,
  trubChillerLossL: 1,
  fermenterLossL: 0,
  mashTunDeadspaceL: 0,
  spargeVesselDeadspaceL: 0,
  grainAbsorptionLPerKg: 0.8,
  coolingShrinkagePct: 4,
  topUpWaterL: 0,
  mashThicknessLPerKg: 3,
  maxMashVolumeL: null,
  maxKettleVolumeL: null,
  hopUtilizationFactor: 1,
  altitudeM: 0,
  notes: null
};
