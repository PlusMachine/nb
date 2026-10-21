import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool, users, userIngredients, brewBatches, recipes, recipeIngredients, recipeInventoryAllocations, eq, inArray, and } from "@nb/db";
import { completeEmailSignIn } from "@nb/auth";
import { createRecipe, deleteRecipe, getRecipeById, updateRecipe, cloneRecipeFromPublic } from "../features/recipes/service";
import { addCatalogIngredientToInventory, updateInventoryQuantity, archiveInventoryItem } from "../features/inventory/service";
import { createBrewBatchFromRecipe, getBrewBatchDetail, updateBrewBatchStatus, setBrewDayStepState } from "../features/brew-batches/service";
import { consumeBrewBatchInventory, restoreBrewBatchInventory, previewBrewBatchConsumption } from "../features/brew-batches/inventory";
import { createEquipmentProfile, getEquipmentProfile, deleteEquipmentProfile } from "../features/equipment-profiles/service";
import { buildStarterEquipmentProfileDefaults } from "../features/equipment/defaults";
import { autoAllocateRecipeInventoryFromStock, consumeRecipeInventoryAllocations } from "../features/recipes/inventory-service";
import { readBrewInventorySnapshot } from "../features/brew-batches/inventory-snapshot";

const ownedUsers: string[] = [];
const hopId = "us-cascade-beervingem-standard";
const ownUser = async () => {
  const user = await completeEmailSignIn({ email: `qa.integration.${randomUUID()}@localhost` });
  ownedUsers.push(user.id);
  return user.id;
};
const recipeFor = async (userId: string, amounts = [6]) => createRecipe(userId, {
  title: "QA integration flow", publicationState: "private", batchSizeEnteredQuantity: 10,
  batchSizeEnteredUnit: "l", efficiency: 65, boilTimeMinutes: 60,
  ingredients: amounts.map((amount, displayOrder) => ({
    persistentKey: randomUUID(), ingredientCatalogItemId: hopId, type: "hop", displayOrder,
    amountEnteredQuantity: amount, amountEnteredUnit: "g", stage: "boil", timeOffset: 60 - displayOrder
  }))
});
const shelfFor = async (userId: string, quantity: number) => addCatalogIngredientToInventory(userId, {
  ingredientCatalogItemId: hopId, enteredQuantity: quantity, enteredUnit: "g"
});
const stockQuantity = async (itemId: string) => (await db.query.userIngredients.findFirst({ where: eq(userIngredients.id, itemId) }))!.normalizedQuantity;

beforeAll(async () => {
  const host = new URL(process.env.DATABASE_URL!).hostname;
  if (!["localhost", "127.0.0.1", "postgres"].includes(host) || process.env.NODE_ENV === "production") throw new Error("LOCAL_TEST_DATABASE_REQUIRED");
  expect(await db.query.ingredients.findFirst({ where: (table, { eq }) => eq(table.id, hopId) })).toBeTruthy();
});
afterAll(async () => {
  if (ownedUsers.length) await db.delete(users).where(inArray(users.id, ownedUsers));
  await pool.end();
});

describe("real PostgreSQL: warehouse and batch invariants", () => {
  it("serializes two consumes for the same batch", async () => {
    const user = await ownUser(), recipe = await recipeFor(user), item = await shelfFor(user, 10);
    const batch = await createBrewBatchFromRecipe(user, recipe.id);
    const attempts = await Promise.allSettled([consumeBrewBatchInventory(user, batch.id, { allowPartial: true }), consumeBrewBatchInventory(user, batch.id, { allowPartial: true })]);
    expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await stockQuantity(item.id)).toBe(4);
    const allocations = await db.query.recipeInventoryAllocations.findMany({ where: and(eq(recipeInventoryAllocations.brewBatchId, batch.id), eq(recipeInventoryAllocations.status, "consumed")) });
    expect(allocations).toHaveLength(1);
  });

  it("two batches cannot consume more than the shared lot", async () => {
    const user = await ownUser(), recipe = await recipeFor(user), item = await shelfFor(user, 10);
    const a = await createBrewBatchFromRecipe(user, recipe.id), b = await createBrewBatchFromRecipe(user, recipe.id);
    await Promise.all([consumeBrewBatchInventory(user, a.id, { allowPartial: true }), consumeBrewBatchInventory(user, b.id, { allowPartial: true })]);
    expect(await stockQuantity(item.id)).toBe(0);
    const consumed = await db.query.recipeInventoryAllocations.findMany({ where: and(eq(recipeInventoryAllocations.userId, user), eq(recipeInventoryAllocations.status, "consumed")) });
    expect(consumed.map(row => row.allocatedQuantityNormalized).sort()).toEqual([4, 6]);
    await Promise.all([restoreBrewBatchInventory(user, a.id), restoreBrewBatchInventory(user, b.id)]);
    expect(await stockQuantity(item.id)).toBe(10);
  });

  it("does not deadlock when both allocations hold the foreign key's KEY SHARE lock", async () => {
    const user = await ownUser(), recipe = await recipeFor(user), item = await shelfFor(user, 10);
    const batches = [await createBrewBatchFromRecipe(user, recipe.id), await createBrewBatchFromRecipe(user, recipe.id)];
    for (const batch of batches) await autoAllocateRecipeInventoryFromStock(user, recipe.id, { brewBatchId: batch.id, batchSnapshot: readBrewInventorySnapshot(batch.recipeSnapshot)! });
    let arrived = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const outcomes = await Promise.allSettled(batches.map(batch => db.transaction(async tx => {
      // INSERT allocation takes this implicit lock for its inventory FK.
      await tx.select({ id: userIngredients.id }).from(userIngredients).where(eq(userIngredients.id, item.id)).for("key share");
      if (++arrived === batches.length) release();
      await gate;
      await consumeRecipeInventoryAllocations(user, recipe.id, { client: tx, brewBatchId: batch.id, batchSnapshot: readBrewInventorySnapshot(batch.recipeSnapshot)!, allowPartialConsume: true });
    })));
    expect(outcomes.filter(result => result.status === "rejected")).toEqual([]);
    expect(await stockQuantity(item.id)).toBe(0);
    await Promise.all(batches.map(batch => restoreBrewBatchInventory(user, batch.id)));
    expect(await stockQuantity(item.id)).toBe(10);
  });

  it("serializes two returns without doubling stock", async () => {
    const user = await ownUser(), recipe = await recipeFor(user), item = await shelfFor(user, 10);
    const batch = await createBrewBatchFromRecipe(user, recipe.id);
    await consumeBrewBatchInventory(user, batch.id, { allowPartial: true });
    await Promise.allSettled([restoreBrewBatchInventory(user, batch.id), restoreBrewBatchInventory(user, batch.id)]);
    expect(await stockQuantity(item.id)).toBe(10);
  });

  it("consuming and returning concurrently conserves stock", async () => {
    const user = await ownUser(), recipe = await recipeFor(user), item = await shelfFor(user, 10);
    const batch = await createBrewBatchFromRecipe(user, recipe.id);
    await consumeBrewBatchInventory(user, batch.id, { allowPartial: true });
    await Promise.allSettled([restoreBrewBatchInventory(user, batch.id), consumeBrewBatchInventory(user, batch.id, { allowPartial: true })]);
    expect([4, 10]).toContain(await stockQuantity(item.id));
    await restoreBrewBatchInventory(user, batch.id);
    expect(await stockQuantity(item.id)).toBe(10);
  });

  it("clamps against changed stock after preview, then returns only the actual amount", async () => {
    const user = await ownUser(), recipe = await recipeFor(user), item = await shelfFor(user, 10);
    const batch = await createBrewBatchFromRecipe(user, recipe.id);
    expect((await previewBrewBatchConsumption(user, batch.id))!.lines[0]!.kind).toBe("exact");
    await updateInventoryQuantity(user, item.id, { enteredQuantity: 2, enteredUnit: "g" });
    const result = await consumeBrewBatchInventory(user, batch.id, { allowPartial: true });
    expect(result.consumed[0]!.quantityNormalized).toBe(2);
    expect(result.consumed[0]!.requiredQuantityNormalized).toBe(6);
    expect(await stockQuantity(item.id)).toBe(0);
    await restoreBrewBatchInventory(user, batch.id);
    expect(await stockQuantity(item.id)).toBe(2);
  });

  it("without partial opt-in a shortage rolls back every write", async () => {
    const user = await ownUser(), recipe = await recipeFor(user, [6, 6]), item = await shelfFor(user, 10);
    const batch = await createBrewBatchFromRecipe(user, recipe.id);
    await expect(consumeBrewBatchInventory(user, batch.id)).rejects.toThrow("INSUFFICIENT_STOCK");
    expect(await stockQuantity(item.id)).toBe(10);
    expect(await db.query.recipeInventoryAllocations.findMany({ where: eq(recipeInventoryAllocations.brewBatchId, batch.id) })).toHaveLength(0);
  });

  it("uses recipe addition order for shared short stock", async () => {
    const user = await ownUser(), recipe = await recipeFor(user, [2, 4, 6, 6, 8]), item = await shelfFor(user, 7.5);
    const batch = await createBrewBatchFromRecipe(user, recipe.id);
    const result = await consumeBrewBatchInventory(user, batch.id, { allowPartial: true });
    expect(result.consumed[0]).toMatchObject({ quantityNormalized: 7.5, requiredQuantityNormalized: 26 });
    expect(result.skippedLineCount).toBe(2);
    expect(await stockQuantity(item.id)).toBe(0);
    await restoreBrewBatchInventory(user, batch.id);
    expect(await stockQuantity(item.id)).toBe(7.5);
  });

  it("uses multiple exact lots when together they cover a recipe line", async () => {
    const user = await ownUser(), recipe = await recipeFor(user, [20]);
    const a = await shelfFor(user, 12), b = await shelfFor(user, 10);
    const batch = await createBrewBatchFromRecipe(user, recipe.id);
    const preview = await previewBrewBatchConsumption(user, batch.id);
    expect(preview!.lines[0]!.kind).toBe("exact");
    const result = await consumeBrewBatchInventory(user, batch.id, { allowPartial: true });
    expect(result.consumed.reduce((sum, line) => sum + line.quantityNormalized, 0)).toBe(20);
    expect(await stockQuantity(a.id) + await stockQuantity(b.id)).toBe(2);
    await restoreBrewBatchInventory(user, batch.id);
    expect(await stockQuantity(a.id)).toBe(12);
    expect(await stockQuantity(b.id)).toBe(10);
  });

  it("repeated additions share both lots without double booking", async () => {
    const user = await ownUser(), recipe = await recipeFor(user, [8, 8, 8]);
    const a = await shelfFor(user, 12), b = await shelfFor(user, 10);
    const batch = await createBrewBatchFromRecipe(user, recipe.id);
    for (let cycle = 0; cycle < 2; cycle++) {
      expect((await previewBrewBatchConsumption(user, batch.id))!.lines.map(line => line.kind)).toEqual(["exact", "exact", "exact_short"]);
      const result = await consumeBrewBatchInventory(user, batch.id, { allowPartial: true });
      expect(result.consumed.reduce((sum, line) => sum + line.quantityNormalized, 0)).toBe(22);
      expect(result.consumed.reduce((sum, line) => sum + (line.requiredQuantityNormalized ?? line.quantityNormalized), 0)).toBe(24);
      expect(await stockQuantity(a.id) + await stockQuantity(b.id)).toBe(0);
      await restoreBrewBatchInventory(user, batch.id);
      expect(await stockQuantity(a.id)).toBe(12);
      expect(await stockQuantity(b.id)).toBe(10);
    }
  });

  it("respects an explicitly pinned lot rather than pooling it with other lots", async () => {
    const user = await ownUser(), source = await recipeFor(user, [20]);
    const pinned = await shelfFor(user, 12), other = await shelfFor(user, 10);
    const recipe = await updateRecipe(user, source.id, { ingredients: source.ingredients.map(line => ({ ...line, inventorySelectionMeta: { inventoryItemId: pinned.id } })) });
    const batch = await createBrewBatchFromRecipe(user, recipe.id);
    const result = await consumeBrewBatchInventory(user, batch.id, { allowPartial: true });
    expect(result.consumed).toHaveLength(1);
    expect(await stockQuantity(pinned.id)).toBe(0);
    expect(await stockQuantity(other.id)).toBe(10);
  });

  it("concurrent batches use both lots without losing available stock", async () => {
    const user = await ownUser(), recipe = await recipeFor(user, [15]);
    const a = await shelfFor(user, 12), b = await shelfFor(user, 10);
    const batches = [await createBrewBatchFromRecipe(user, recipe.id), await createBrewBatchFromRecipe(user, recipe.id)];
    const results = await Promise.all(batches.map(batch => consumeBrewBatchInventory(user, batch.id, { allowPartial: true })));
    expect(results.map(result => result.consumed.reduce((sum, line) => sum + line.quantityNormalized, 0)).sort((a, b) => a - b)).toEqual([7, 15]);
    expect(await stockQuantity(a.id) + await stockQuantity(b.id)).toBe(0);
    await Promise.all(batches.map(batch => restoreBrewBatchInventory(user, batch.id)));
    expect(await stockQuantity(a.id) + await stockQuantity(b.id)).toBe(22);
  });

  it("a returned partial batch can use replenished lots rather than stale pending allocations", async () => {
    const user = await ownUser(), recipe = await recipeFor(user, [8, 8, 8]);
    await shelfFor(user, 6);
    await shelfFor(user, 4);
    const batch = await createBrewBatchFromRecipe(user, recipe.id);
    const first = await consumeBrewBatchInventory(user, batch.id, { allowPartial: true });
    expect(first.consumed.reduce((sum, line) => sum + line.quantityNormalized, 0)).toBe(10);
    expect(first.skippedLineCount).toBe(1);
    await restoreBrewBatchInventory(user, batch.id);
    await shelfFor(user, 18);
    const second = await consumeBrewBatchInventory(user, batch.id, { allowPartial: true });
    expect(second.consumed.reduce((sum, line) => sum + line.quantityNormalized, 0)).toBe(24);
    expect(second.skippedLineCount).toBe(0);
    expect(second.consumed.every(line => line.requiredQuantityNormalized == null)).toBe(true);
  });

  it.each(["completed", "cancelled"] as const)("%s batch cannot consume stock", async status => {
    const user = await ownUser(), recipe = await recipeFor(user), item = await shelfFor(user, 10);
    const batch = await createBrewBatchFromRecipe(user, recipe.id);
    await updateBrewBatchStatus(user, batch.id, status);
    await expect(consumeBrewBatchInventory(user, batch.id, { allowPartial: true })).rejects.toThrow("INVALID_STATUS");
    expect(await stockQuantity(item.id)).toBe(10);
  });

  it("a changed or deleted source cannot change planned consumption and targets", async () => {
    const user = await ownUser(), recipe = await recipeFor(user), item = await shelfFor(user, 10);
    const batch = await createBrewBatchFromRecipe(user, recipe.id);
    const original = await getBrewBatchDetail(user, batch.id);
    await updateRecipe(user, recipe.id, { ingredients: recipe.ingredients.map(line => ({ ...line, amountEnteredQuantity: 100 })) });
    expect((await getBrewBatchDetail(user, batch.id))!.summary.target).toEqual(original!.summary.target);
    await deleteRecipe(user, recipe.id);
    expect((await getBrewBatchDetail(user, batch.id))!.batch.recipeId).toBeNull();
    const result = await consumeBrewBatchInventory(user, batch.id, { allowPartial: true });
    expect(result.consumed[0]!.quantityNormalized).toBe(6);
    expect(await stockQuantity(item.id)).toBe(4);
  });

  it("archiving stock after preview prevents accidental consumption", async () => {
    const user = await ownUser(), recipe = await recipeFor(user), item = await shelfFor(user, 10);
    const batch = await createBrewBatchFromRecipe(user, recipe.id);
    await previewBrewBatchConsumption(user, batch.id);
    await archiveInventoryItem(user, item.id);
    const result = await consumeBrewBatchInventory(user, batch.id, { allowPartial: true });
    expect(result.consumed).toHaveLength(0);
    expect(result.skippedLineCount).toBe(1);
    expect(await stockQuantity(item.id)).toBe(10);
  });

  it("concurrent creation with one idempotency key creates one batch", async () => {
    const user = await ownUser(), recipe = await recipeFor(user), key = randomUUID();
    const [a, b] = await Promise.all([createBrewBatchFromRecipe(user, recipe.id, { idempotencyKey: key }), createBrewBatchFromRecipe(user, recipe.id, { idempotencyKey: key })]);
    expect(a.id).toBe(b.id);
    expect(await db.query.brewBatches.findMany({ where: eq(brewBatches.userId, user) })).toHaveLength(1);
  });

  it("deleting equipment preserves the batch's selected snapshot", async () => {
    const user = await ownUser(), recipe = await recipeFor(user);
    const profile = await createEquipmentProfile(user, { ...buildStarterEquipmentProfileDefaults(), name: "QA snapshot", targetBatchVolumeL: 10 });
    const batch = await createBrewBatchFromRecipe(user, recipe.id, { equipmentProfileId: profile.id });
    await deleteEquipmentProfile(user, profile.id);
    const detail = await getBrewBatchDetail(user, batch.id);
    expect(detail!.batch.equipmentProfileSnapshot).toEqual(batch.equipmentProfileSnapshot);
  });

  it("other users cannot inspect or mutate private recipe, profile, stock or batch", async () => {
    const owner = await ownUser(), stranger = await ownUser(), recipe = await recipeFor(owner), item = await shelfFor(owner, 10);
    const profile = await createEquipmentProfile(owner, { ...buildStarterEquipmentProfileDefaults(), name: "Private equipment" });
    const batch = await createBrewBatchFromRecipe(owner, recipe.id);
    expect(await getBrewBatchDetail(stranger, batch.id)).toBeNull();
    await expect(getRecipeById(stranger, recipe.id)).rejects.toThrow();
    await expect(getEquipmentProfile(stranger, profile.id)).rejects.toThrow("NOT_FOUND");
    await expect(updateInventoryQuantity(stranger, item.id, { enteredQuantity: 999, enteredUnit: "g" })).rejects.toThrow("NOT_FOUND");
    await expect(consumeBrewBatchInventory(stranger, batch.id, { allowPartial: true })).rejects.toThrow("NOT_FOUND");
    await expect(restoreBrewBatchInventory(stranger, batch.id)).rejects.toThrow("NOT_FOUND");
    expect(await stockQuantity(item.id)).toBe(10);
  });
});
