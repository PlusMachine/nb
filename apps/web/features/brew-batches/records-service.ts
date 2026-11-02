import { and, asc, brewBatches, brewBatchTasks, count, db, eq, equipmentProfiles, inArray, users } from "@nb/db";
import { assertRateLimit } from "@nb/auth";

import { formatBrewBatchDisplayTitle } from "./contracts";
import { getBrewBatchById } from "./service";
import { batchTaskInputSchema, calibrationSchema, calculateBatchCalibration, readVolumeMeasurements, volumeMeasurementsSchema, type BatchTaskDto, type BatchTaskInput, type OverviewTaskDto, type VolumeMeasurements } from "./records";

export const saveBatchVolumes = async (userId: string, id: string, input: unknown) => {
  const patch = volumeMeasurementsSchema.parse(input);
  return db.transaction(async tx => {
    const [batch] = await tx.select().from(brewBatches).where(and(eq(brewBatches.id, id), eq(brewBatches.userId, userId))).for("update");
    if (!batch) throw new Error("NOT_FOUND");
    const volumes = { ...readVolumeMeasurements(batch.volumeMeasurements), ...patch };
    await tx.update(brewBatches).set({ volumeMeasurements: volumes, updatedAt: new Date() }).where(eq(brewBatches.id, id));
    return volumes;
  });
};

export const updateEquipmentFromBatch = async (userId: string, id: string, input: {
  boilMinutes: number; sameTemperature: true; profileUpdatedAt: string; volumes: VolumeMeasurements;
}) => {
  calibrationSchema.parse(input);
  const expected = volumeMeasurementsSchema.parse(input.volumes);
  return db.transaction(async tx => {
    const [batch] = await tx.select().from(brewBatches).where(and(eq(brewBatches.id, id), eq(brewBatches.userId, userId))).for("update");
    if (!batch) throw new Error("NOT_FOUND");
    const profileId = batch.equipmentProfileSnapshot?.id;
    if (typeof profileId !== "string") throw new Error("NO_PROFILE");
    const [profile] = await tx.select().from(equipmentProfiles).where(and(eq(equipmentProfiles.id, profileId), eq(equipmentProfiles.userId, userId))).for("update");
    if (!profile) throw new Error("NO_PROFILE");
    const volumes = readVolumeMeasurements(batch.volumeMeasurements);
    if (profile.updatedAt.toISOString() !== input.profileUpdatedAt || Object.keys({ ...volumes, ...expected }).some(key => volumes[key as keyof VolumeMeasurements] !== expected[key as keyof VolumeMeasurements])) throw new Error("STALE_PREVIEW");
    const next = calculateBatchCalibration(volumes, input.boilMinutes, profile.coolingShrinkagePct);
    if (!next) throw new Error("INVALID_VOLUMES");
    await tx.update(equipmentProfiles).set({ ...next, updatedAt: new Date() }).where(eq(equipmentProfiles.id, profile.id));
    // Снапшоты уже созданных партий не меняются.
  });
};

export const listBatchTasks = async (userId: string, id: string): Promise<BatchTaskDto[]> => {
  if (!await getBrewBatchById(userId, id)) throw new Error("NOT_FOUND");
  return db.select().from(brewBatchTasks).where(eq(brewBatchTasks.brewBatchId, id)).orderBy(asc(brewBatchTasks.dueDate), asc(brewBatchTasks.dueTime), asc(brewBatchTasks.createdAt));
};
export const listOverviewTasks = async (userId: string): Promise<OverviewTaskDto[]> => {
  const rows = await db.select({ task: brewBatchTasks, name: brewBatches.name, brewNumber: brewBatches.brewNumber }).from(brewBatchTasks)
    .innerJoin(brewBatches, eq(brewBatches.id, brewBatchTasks.brewBatchId))
    .where(and(eq(brewBatches.userId, userId), inArray(brewBatches.status, ["planned", "brewing", "fermenting", "completed"])))
    .orderBy(asc(brewBatchTasks.dueDate), asc(brewBatchTasks.dueTime), asc(brewBatchTasks.createdAt));
  return rows.map(row => ({ ...row.task, batchTitle: formatBrewBatchDisplayTitle(row.name, row.brewNumber) }));
};
export const addBatchTask = async (userId: string, id: string, input: BatchTaskInput): Promise<void> => {
  const parsed = batchTaskInputSchema.parse(input);
  await assertRateLimit(userId, "brew_task_create", 60, 3600);
  await db.transaction(async tx => {
    // Сериализуем квоту между разными партиями одного пользователя.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [batch] = await tx.select({ id: brewBatches.id }).from(brewBatches).where(and(eq(brewBatches.id, id), eq(brewBatches.userId, userId)));
    if (!batch) throw new Error("NOT_FOUND");
    const [total] = await tx.select({ value: count() }).from(brewBatchTasks).innerJoin(brewBatches, eq(brewBatches.id, brewBatchTasks.brewBatchId)).where(eq(brewBatches.userId, userId));
    if ((total?.value ?? 0) >= 1000) throw new Error("TASK_QUOTA");
    await tx.insert(brewBatchTasks).values({ brewBatchId: id, ...parsed });
  });
};
export const changeBatchTask = async (userId: string, batchId: string, taskId: string, patch: { completed?: boolean; input?: BatchTaskInput; remove?: boolean }) => {
  if (patch.input) batchTaskInputSchema.parse(patch.input);
  const ownedBatch = db.select({ id: brewBatches.id }).from(brewBatches).where(and(eq(brewBatches.id, batchId), eq(brewBatches.userId, userId)));
  const where = and(eq(brewBatchTasks.id, taskId), inArray(brewBatchTasks.brewBatchId, ownedBatch));
  const rows = patch.remove
    ? await db.delete(brewBatchTasks).where(where).returning({ id: brewBatchTasks.id })
    : await db.update(brewBatchTasks).set({ ...(patch.input ?? {}), ...(patch.completed === undefined ? {} : { completedAt: patch.completed ? new Date() : null }) }).where(where).returning({ id: brewBatchTasks.id });
  if (!rows.length) throw new Error("NOT_FOUND");
};
