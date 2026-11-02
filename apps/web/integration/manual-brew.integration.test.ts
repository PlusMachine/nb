import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool, users, eq, inArray } from "@nb/db";
import { completeEmailSignIn } from "@nb/auth";
import { createRecipe } from "../features/recipes/service";
import { createBrewBatchFromRecipe, getBrewBatchDetail, saveManualBrewTransfer, setBrewDayStepState, updateBrewBatchStatus } from "../features/brew-batches/service";

const owned: string[] = [];
const account = async () => { const user = await completeEmailSignIn({ email: `qa.manual-brew.${randomUUID()}@localhost` }); owned.push(user.id); return user.id; };
async function fixture() {
  const userId = await account();
  const recipe = await createRecipe(userId, { title: "QA manual master", publicationState: "private", batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l", efficiency: 70, boilTimeMinutes: 60, ingredients: [] });
  const batch = await createBrewBatchFromRecipe(userId, recipe.id);
  await updateBrewBatchStatus(userId, batch.id, "brewing");
  return { userId, id: batch.id };
}
const input = () => ({ operationId: randomUUID(), takenAt: new Date().toISOString(), gravitySg: 1.056, fermenterL: 23 });
beforeAll(() => {
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("LOCAL_TEST_DATABASE_REQUIRED");
});
afterAll(async () => { if (owned.length) await db.delete(users).where(inArray(users.id, owned)); await pool.end(); });

describe("manual brew master persistence", () => {
  it("commits OG, volume and transfer together and safely replays a lost response", async () => {
    const batch = await fixture(); const command = input();
    await Promise.all([saveManualBrewTransfer(batch.userId, batch.id, command), saveManualBrewTransfer(batch.userId, batch.id, command)]);
    const detail = (await getBrewBatchDetail(batch.userId, batch.id))!;
    expect(detail.measurements).toHaveLength(1);
    expect(detail.measurements[0]).toMatchObject({ id: command.operationId, gravitySg: 1.056, isFinal: false });
    expect(detail.batch.volumeMeasurements?.fermenterL).toBe(23);
    expect(detail.batch.brewDayProgress.steps["brew:transfer"]).toMatchObject({ done: true, measurementOperationId: command.operationId, completedAt: command.takenAt, gravitySg: 1.056 });
    await updateBrewBatchStatus(batch.userId, batch.id, "fermenting");
    await saveManualBrewTransfer(batch.userId, batch.id, command);
    expect((await getBrewBatchDetail(batch.userId, batch.id))!.measurements).toHaveLength(1);
    expect((await getBrewBatchDetail(batch.userId, batch.id))!.batch.brewDayProgress.steps["brew:pitch"].done).toBe(true);
  });
  it("rejects invalid and foreign writes without partial records", async () => {
    const batch = await fixture(); const stranger = await account();
    await expect(saveManualBrewTransfer(stranger, batch.id, input())).rejects.toThrow("NOT_FOUND");
    await expect(saveManualBrewTransfer(batch.userId, batch.id, { ...input(), fermenterL: -1 })).rejects.toThrow();
    const detail = (await getBrewBatchDetail(batch.userId, batch.id))!;
    expect(detail.measurements).toHaveLength(0);
    expect(detail.batch.brewDayProgress.steps["brew:transfer"]).toBeUndefined();
    expect(detail.batch.volumeMeasurements?.fermenterL).toBeUndefined();
  });
  it("keeps timer corrections and an explicit skipped transfer across server writes", async () => {
    const batch = await fixture(); const startedAt = new Date().toISOString();
    await setBrewDayStepState(batch.userId, batch.id, "boil:timer", { timerStartedAt: startedAt, timerDurationSeconds: 4200 });
    await setBrewDayStepState(batch.userId, batch.id, "brew:transfer", { done: true, skipped: true, completedAt: startedAt });
    const progress = (await getBrewBatchDetail(batch.userId, batch.id))!.batch.brewDayProgress;
    expect(progress.steps["boil:timer"]).toMatchObject({ timerStartedAt: startedAt, timerDurationSeconds: 4200, done: false });
    expect(progress.steps["brew:transfer"]).toMatchObject({ done: true, skipped: true, completedAt: startedAt });
  });
  it("saves a volume-only transfer and rejects a new transfer after fermentation", async () => {
    const batch = await fixture();
    await saveManualBrewTransfer(batch.userId, batch.id, { ...input(), gravitySg: null });
    expect((await getBrewBatchDetail(batch.userId, batch.id))!.measurements).toHaveLength(0);
    await updateBrewBatchStatus(batch.userId, batch.id, "fermenting");
    await expect(saveManualBrewTransfer(batch.userId, batch.id, input())).rejects.toThrow("INVALID_STAGE");
  });
});
