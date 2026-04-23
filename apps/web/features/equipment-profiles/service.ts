import { and, count, db, desc, eq, equipmentProfiles } from "@nb/db";

import {
  equipmentProfilePayloadSchema,
  updateEquipmentProfilePayloadSchema,
  type EquipmentProfileDto
} from "./contracts";

const mapEquipmentProfileDto = (row: typeof equipmentProfiles.$inferSelect): EquipmentProfileDto => ({
  id: row.id,
  userId: row.userId,
  name: row.name,
  targetBatchVolumeL: row.targetBatchVolumeL,
  brewhouseEfficiencyPct: row.brewhouseEfficiencyPct,
  evaporationRateLPerHr: row.evaporationRateLPerHr,
  trubChillerLossL: row.trubChillerLossL,
  fermenterLossL: row.fermenterLossL,
  grainAbsorptionLPerKg: row.grainAbsorptionLPerKg,
  coolingShrinkagePct: row.coolingShrinkagePct,
  mashThicknessLPerKg: row.mashThicknessLPerKg,
  maxMashVolumeL: row.maxMashVolumeL,
  maxKettleVolumeL: row.maxKettleVolumeL,
  hopUtilizationFactor: row.hopUtilizationFactor,
  altitudeM: row.altitudeM,
  isDefault: row.isDefault,
  notes: row.notes,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const buildDuplicateEquipmentProfileName = (sourceName: string, existingNames: Set<string>) => {
  const baseName = sourceName.trim() || "Профиль оборудования";
  const firstSuffix = " (копия)";
  const maxBaseLength = 180 - firstSuffix.length;
  const normalizedBase = baseName.length > maxBaseLength ? baseName.slice(0, maxBaseLength).trim() : baseName;
  const firstCandidate = `${normalizedBase}${firstSuffix}`;

  if (!existingNames.has(firstCandidate)) {
    return firstCandidate;
  }

  for (let index = 2; index < 1000; index += 1) {
    const suffix = ` (копия ${index})`;
    const trimmedBase = normalizedBase.length > 180 - suffix.length
      ? normalizedBase.slice(0, 180 - suffix.length).trim()
      : normalizedBase;
    const candidate = `${trimmedBase}${suffix}`;

    if (!existingNames.has(candidate)) {
      return candidate;
    }
  }

  throw new Error("DUPLICATE_NAME_FAILED");
};

export const listEquipmentProfiles = async (userId: string): Promise<EquipmentProfileDto[]> => {
  const rows = await db.query.equipmentProfiles.findMany({
    where: eq(equipmentProfiles.userId, userId),
    orderBy: [desc(equipmentProfiles.isDefault), desc(equipmentProfiles.updatedAt)]
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

export const createEquipmentProfile = async (
  userId: string,
  payload: unknown
): Promise<EquipmentProfileDto> => {
  const parsed = equipmentProfilePayloadSchema.parse(payload);
  const [{ value: existingProfileCount }] = await db.select({ value: count() })
    .from(equipmentProfiles)
    .where(eq(equipmentProfiles.userId, userId));
  const [created] = await db.insert(equipmentProfiles).values({
    userId,
    ...parsed,
    isDefault: existingProfileCount === 0
  }).returning();

  if (!created) {
    throw new Error("CREATE_FAILED");
  }

  return mapEquipmentProfileDto(created);
};

export const duplicateEquipmentProfile = async (
  userId: string,
  profileId: string
): Promise<EquipmentProfileDto> => {
  const profile = await getEquipmentProfile(userId, profileId);
  const existingProfiles = await listEquipmentProfiles(userId);
  const name = buildDuplicateEquipmentProfileName(
    profile.name,
    new Set(existingProfiles.map((existingProfile) => existingProfile.name))
  );

  return createEquipmentProfile(userId, {
    ...profile,
    name,
    isDefault: false
  });
};

export const setDefaultEquipmentProfile = async (
  userId: string,
  profileId: string
): Promise<EquipmentProfileDto> => {
  await getEquipmentProfile(userId, profileId);
  const now = new Date();

  await db.update(equipmentProfiles).set({
    isDefault: false
  }).where(eq(equipmentProfiles.userId, userId));

  const [updated] = await db.update(equipmentProfiles).set({
    isDefault: true,
    updatedAt: now
  }).where(and(
    eq(equipmentProfiles.id, profileId),
    eq(equipmentProfiles.userId, userId)
  )).returning();

  if (!updated) {
    throw new Error("NOT_FOUND");
  }

  return mapEquipmentProfileDto(updated);
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

  if (profile.isDefault) {
    const replacement = await db.query.equipmentProfiles.findFirst({
      where: eq(equipmentProfiles.userId, userId),
      orderBy: [desc(equipmentProfiles.updatedAt)]
    });

    if (replacement) {
      await db.update(equipmentProfiles).set({
        isDefault: true,
        updatedAt: new Date()
      }).where(and(
        eq(equipmentProfiles.id, replacement.id),
        eq(equipmentProfiles.userId, userId)
      ));
    }
  }

  return profile;
};
