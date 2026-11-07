import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { brewBatches, brewMeasurements, db, eq, pool, users } from "@nb/db";
import { completeEmailSignIn } from "@nb/auth";

import { getOfflineBrewSnapshot, syncOfflineBrewOperation } from "../features/brew-batches/offline/service";
import { makeOfflineBrewOperation } from "../features/brew-batches/offline/storage";

let ownerId: string | undefined;
beforeAll(() => {
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) {
    throw new Error("LOCAL_TEST_DATABASE_REQUIRED");
  }
});
afterAll(async () => {
  if (ownerId) await db.delete(users).where(eq(users.id, ownerId));
  await pool.end();
});

it("merges independent offline edits and protects the newer value from a replay", async () => {
  const owner = await completeEmailSignIn({ email: `qa.offline-sync.${randomUUID()}@localhost` });
  ownerId = owner.id;
  const [batch] = await db.insert(brewBatches).values({
    userId: owner.id, name: "QA offline conflict", brewNumber: 1, status: "brewing",
    brewPlanSnapshot: {
      version: "brew_plan_v1",
      recipe: { id: randomUUID(), title: "QA offline conflict", versionNumber: 1, batchSizeL: 20 },
      equipmentProfileSnapshot: null, waterPlanMeta: null, mashSteps: [],
      boilPlan: { boilTimeMinutes: 60, timedAdditions: [] }, whirlpoolPlan: [],
      fermentationPlan: null, packagingPlan: null, deviceHints: []
    }
  }).returning();
  const get = () => getOfflineBrewSnapshot(owner.id, batch.id, "sg");
  const sync = (operation: ReturnType<typeof makeOfflineBrewOperation>) => syncOfflineBrewOperation(owner.id, batch.id, "sg", operation);
  const initial = await get();
  const preBoil = makeOfflineBrewOperation(initial, { kind: "volumes", patch: { preBoilL: 26 } });
  const postBoil = makeOfflineBrewOperation(initial, { kind: "volumes", patch: { postBoilL: 21 } });
  expect((await Promise.all([sync(preBoil), sync(postBoil)])).map(result => result.status)).toEqual(["applied", "applied"]);
  const current = await get();
  expect(current.volumes).toEqual({ preBoilL: 26, postBoilL: 21 });
  await sync(makeOfflineBrewOperation(current, { kind: "volumes", patch: { preBoilL: 28 } }));
  expect((await sync(preBoil)).snapshot.volumes.preBoilL).toBe(28);
  expect((await sync(makeOfflineBrewOperation(current, { kind: "volumes", patch: { preBoilL: 29 } }))).status).toBe("conflict");

  const rows = await db.insert(brewMeasurements).values([
    { userId: owner.id, brewBatchId: batch.id, gravitySg: 1.012 },
    { userId: owner.id, brewBatchId: batch.id, gravitySg: 1.013 }
  ]).returning();
  const withoutFinal = await get();
  const choices = rows.map(row => makeOfflineBrewOperation(withoutFinal, { kind: "final-measurement", id: row.id }));
  const results = await Promise.all(choices.map(sync));
  expect(results.map(result => result.status).sort()).toEqual(["applied", "conflict"]);
  expect((await get()).measurements.filter(row => row.isFinal)).toHaveLength(1);
});
