import { and, db, desc, eq, equipmentProfiles } from "@nb/db";

import {
  equipmentProfilePayloadSchema,
  updateEquipmentProfilePayloadSchema,
  type EquipmentProfileDto,
  type EquipmentProfileSnapshot
} from "./contracts";

const mapEquipmentProfileDto = (row: typeof equipmentProfiles.$inferSelect): EquipmentProfileDto => ({
  id: row.id,
  userId: row.userId,
  name: row.name,
  brewMethod: row.brewMethod,
  batchTargetType: row.batchTargetType,
  targetBatchVolumeL: row.targetBatchVolumeL,
  boilTimeMin: row.boilTimeMin,
  brewhouseEfficiencyPct: row.brewhouseEfficiencyPct,
  mashEfficiencyPct: row.mashEfficiencyPct,
  evaporationRateLPerHr: row.evaporationRateLPerHr,
  trubChillerLossL: row.trubChillerLossL,
  fermenterLossL: row.fermenterLossL,
  mashTunDeadspaceL: row.mashTunDeadspaceL,
  spargeVesselDeadspaceL: row.spargeVesselDeadspaceL,
  grainAbsorptionLPerKg: row.grainAbsorptionLPerKg,
  coolingShrinkagePct: row.coolingShrinkagePct,
  topUpWaterL: row.topUpWaterL,
  mashThicknessLPerKg: row.mashThicknessLPerKg,
  maxMashVolumeL: row.maxMashVolumeL,
  maxKettleVolumeL: row.maxKettleVolumeL,
  hopUtilizationFactor: row.hopUtilizationFactor,
  altitudeM: row.altitudeM,
  notes: row.notes,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

export const buildEquipmentProfileSnapshot = (
  row: typeof equipmentProfiles.$inferSelect,
  snapshotAt = new Date()
): EquipmentProfileSnapshot => {
  const dto = mapEquipmentProfileDto(row);

  return {
    id: dto.id,
    name: dto.name,
    brewMethod: dto.brewMethod,
    batchTargetType: dto.batchTargetType,
    targetBatchVolumeL: dto.targetBatchVolumeL,
    boilTimeMin: dto.boilTimeMin,
    brewhouseEfficiencyPct: dto.brewhouseEfficiencyPct,
    mashEfficiencyPct: dto.mashEfficiencyPct,
    evaporationRateLPerHr: dto.evaporationRateLPerHr,
    trubChillerLossL: dto.trubChillerLossL,
    fermenterLossL: dto.fermenterLossL,
    mashTunDeadspaceL: dto.mashTunDeadspaceL,
    spargeVesselDeadspaceL: dto.spargeVesselDeadspaceL,
    grainAbsorptionLPerKg: dto.grainAbsorptionLPerKg,
    coolingShrinkagePct: dto.coolingShrinkagePct,
    topUpWaterL: dto.topUpWaterL,
    mashThicknessLPerKg: dto.mashThicknessLPerKg,
    maxMashVolumeL: dto.maxMashVolumeL,
    maxKettleVolumeL: dto.maxKettleVolumeL,
    hopUtilizationFactor: dto.hopUtilizationFactor,
    altitudeM: dto.altitudeM,
    notes: dto.notes,
    snapshotAt: snapshotAt.toISOString()
  };
};

export const listEquipmentProfiles = async (userId: string): Promise<EquipmentProfileDto[]> => {
  const rows = await db.query.equipmentProfiles.findMany({
    where: eq(equipmentProfiles.userId, userId),
    orderBy: [desc(equipmentProfiles.updatedAt)]
  });

  return rows.map(mapEquipmentProfileDto);
};

export const getEquipmentProfile = async (userId: string, profileId: string): Promise<EquipmentProfileDto> => {
  const row = await db.query.equipmentProfiles.findFirst({
    where: and(eq(equipmentProfiles.id, profileId), eq(equipmentProfiles.userId, userId))
  });

  if (!row) {
    throw new Error("NOT_FOUND");
  }

  return mapEquipmentProfileDto(row);
};

export const getEquipmentProfileSnapshot = async (
  userId: string,
  profileId: string
): Promise<EquipmentProfileSnapshot> => {
  const row = await db.query.equipmentProfiles.findFirst({
    where: and(eq(equipmentProfiles.id, profileId), eq(equipmentProfiles.userId, userId))
  });

  if (!row) {
    throw new Error("NOT_FOUND");
  }

  return buildEquipmentProfileSnapshot(row);
};

export const createEquipmentProfile = async (
  userId: string,
  payload: unknown
): Promise<EquipmentProfileDto> => {
  const parsed = equipmentProfilePayloadSchema.parse(payload);
  const [created] = await db.insert(equipmentProfiles).values({
    userId,
    ...parsed
  }).returning();

  if (!created) {
    throw new Error("CREATE_FAILED");
  }

  return mapEquipmentProfileDto(created);
};

export const updateEquipmentProfile = async (
  userId: string,
  profileId: string,
  payload: unknown
): Promise<EquipmentProfileDto> => {
  const parsed = updateEquipmentProfilePayloadSchema.parse(payload);
  const [updated] = await db.update(equipmentProfiles).set({
    ...parsed,
    updatedAt: new Date()
  }).where(and(
    eq(equipmentProfiles.id, profileId),
    eq(equipmentProfiles.userId, userId)
  )).returning();

  if (!updated) {
    throw new Error("NOT_FOUND");
  }

  return mapEquipmentProfileDto(updated);
};

export const deleteEquipmentProfile = async (userId: string, profileId: string) => {
  const profile = await getEquipmentProfile(userId, profileId);
  await db.delete(equipmentProfiles).where(and(
    eq(equipmentProfiles.id, profileId),
    eq(equipmentProfiles.userId, userId)
  ));

  return profile;
};
