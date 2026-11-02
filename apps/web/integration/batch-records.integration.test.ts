import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool, users, brewBatchTasks, inArray, eq } from "@nb/db";
import { completeEmailSignIn } from "@nb/auth";
import { createRecipe } from "../features/recipes/service";
import { createBrewBatchFromRecipe, getBrewBatchDetail, updateBrewBatchStatus, deleteBrewBatch } from "../features/brew-batches/service";
import { createEquipmentProfile, getEquipmentProfile } from "../features/equipment-profiles/service";
import { starterEquipmentProfileDefaults } from "../features/equipment-profiles/contracts";
import { addBatchTask, changeBatchTask, listBatchTasks, listOverviewTasks, saveBatchVolumes, updateEquipmentFromBatch } from "../features/brew-batches/records-service";
import { buildBatchComparison } from "../features/brew-batches/comparison";

const owned: string[] = [];
const account = async () => { const user = await completeEmailSignIn({ email: `qa.batch-records.${randomUUID()}@localhost` }); owned.push(user.id); return user.id; };
const fixture = async () => {
  const userId = await account();
  const profile = await createEquipmentProfile(userId, { ...starterEquipmentProfileDefaults, name: "Проверка замеров" });
  const recipe = await createRecipe(userId, { title: "Проверка партии", publicationState: "private", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l", efficiency: 70, boilTimeMinutes: 60, ingredients: [] });
  const batch = await createBrewBatchFromRecipe(userId, recipe.id, { equipmentProfileId: profile.id });
  return { userId, profile, batch, recipe };
};
beforeAll(() => { if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("LOCAL_TEST_DATABASE_REQUIRED"); });
afterAll(async () => { if (owned.length) await db.delete(users).where(inArray(users.id, owned)); await pool.end(); });

describe("batch measurements and tasks in PostgreSQL", () => {
  it("preserves concurrent edits to separate volume fields and restricts ownership", async () => {
    const { userId, batch } = await fixture(), stranger = await account();
    await Promise.all([saveBatchVolumes(userId, batch.id, { preBoilL: 26 }), saveBatchVolumes(userId, batch.id, { bottledL: 18 })]);
    expect((await getBrewBatchDetail(userId, batch.id))?.batch.volumeMeasurements).toMatchObject({ preBoilL: 26, bottledL: 18 });
    await expect(saveBatchVolumes(stranger, batch.id, { bottledL: 100 })).rejects.toThrow("NOT_FOUND");
    expect(await getBrewBatchDetail(stranger, batch.id)).toBeNull();
    await saveBatchVolumes(userId, batch.id, { preBoilL: null });
    expect((await getBrewBatchDetail(userId, batch.id))?.batch.volumeMeasurements).toMatchObject({ preBoilL: null, bottledL: 18 });
  });
  it("updates only owned live equipment, rejects a stale preview, and retains batch snapshots", async () => {
    const { userId, batch, profile, recipe } = await fixture();
    const volumes = await saveBatchVolumes(userId, batch.id, { preBoilL: 26.76, postBoilL: 21, fermenterL: 20 });
    const snapshot = batch.equipmentProfileSnapshot;
    await updateEquipmentFromBatch(userId, batch.id, { boilMinutes: 90, sameTemperature: true, profileUpdatedAt: profile.updatedAt.toISOString(), volumes });
    expect((await getEquipmentProfile(userId, profile.id)).evaporationRateLPerHr).toBe(4);
    expect((await getBrewBatchDetail(userId, batch.id))?.batch.equipmentProfileSnapshot).toEqual(snapshot);
    const nextBatch = await createBrewBatchFromRecipe(userId, recipe.id, { equipmentProfileId: profile.id });
    expect(nextBatch.equipmentProfileSnapshot?.evaporationRateLPerHr).toBe(4);
    await expect(updateEquipmentFromBatch(userId, batch.id, { boilMinutes: 90, sameTemperature: true, profileUpdatedAt: profile.updatedAt.toISOString(), volumes })).rejects.toThrow("STALE_PREVIEW");
  });
  it("creates, edits, completes, restores, deletes tasks and prevents cross-account changes", async () => {
    const { userId, batch } = await fixture(), stranger = await account();
    await addBatchTask(userId, batch.id, { title: "Измерить плотность", dueDate: "2026-10-30", dueTime: "10:00" });
    const [task] = await listBatchTasks(userId, batch.id);
    await expect(changeBatchTask(stranger, batch.id, task!.id, { completed: true })).rejects.toThrow("NOT_FOUND");
    await changeBatchTask(userId, batch.id, task!.id, { input: { title: "Проверить плотность", dueDate: "2026-10-31", dueTime: null } });
    await changeBatchTask(userId, batch.id, task!.id, { completed: true });
    expect((await listBatchTasks(userId, batch.id))[0]).toMatchObject({ dueDate: "2026-10-31", completedAt: expect.any(Date) });
    await changeBatchTask(userId, batch.id, task!.id, { completed: false });
    expect((await listOverviewTasks(userId))[0]).toMatchObject({ title: "Проверить плотность", completedAt: null });
    expect(await listOverviewTasks(stranger)).toEqual([]);
    await updateBrewBatchStatus(userId, batch.id, "completed");
    expect(await listOverviewTasks(userId)).toHaveLength(1);
    await updateBrewBatchStatus(userId, batch.id, "cancelled");
    expect(await listOverviewTasks(userId)).toEqual([]);
    await changeBatchTask(userId, batch.id, task!.id, { remove: true });
    expect(await listBatchTasks(userId, batch.id)).toEqual([]);
    await addBatchTask(userId, batch.id, { title: "Проверить", dueDate: "2026-10-31", dueTime: null });
    await deleteBrewBatch(userId, batch.id);
    expect(await db.select().from(brewBatchTasks).where(eq(brewBatchTasks.brewBatchId, batch.id))).toEqual([]);
  });
  it("comparison reads saved plans and measurements of two owned parties", async () => {
    const { userId, batch, recipe } = await fixture();
    const other = await createBrewBatchFromRecipe(userId, recipe.id);
    await saveBatchVolumes(userId, batch.id, { bottledL: 18 });
    const a = (await getBrewBatchDetail(userId, batch.id))!, b = (await getBrewBatchDetail(userId, other.id))!;
    expect(buildBatchComparison(a, b, "sg").rows.find(r => r.label === "Разлито, л")?.values).toEqual(["18", "—"]);
  });
});
