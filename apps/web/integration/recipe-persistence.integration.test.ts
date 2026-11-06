import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool, users, recipes, eq, inArray } from "@nb/db";
import { completeEmailSignIn } from "@nb/auth";
import { createRecipe, createRecipeVersion, getRecipeById, updateRecipe, deleteRecipe } from "../features/recipes/service";

const owned: string[] = [];
let owner: string;
const line = (extra: Record<string, unknown> = {}) => ({ persistentKey: randomUUID(), ingredientCatalogItemId: "us-cascade-beervingem-standard",
  type: "hop", amountEnteredQuantity: 20, amountEnteredUnit: "g", stage: "boil", timeOffset: 60, ...extra });
const payload = (extra: Record<string, unknown> = {}) => ({ title: "QA persistence", publicationState: "private", batchSizeEnteredQuantity: 30,
  batchSizeEnteredUnit: "l", boilTimeMinutes: 90, ingredients: [line()], ...extra });
beforeAll(() => {
  const host = new URL(process.env.DATABASE_URL!).hostname;
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "postgres"].includes(host)) throw new Error("LOCAL_TEST_DATABASE_REQUIRED");
});
beforeEach(async () => {
  owner = (await completeEmailSignIn({ email: "qa.persist." + randomUUID() + "@localhost" })).id;
  owned.push(owner);
});
afterAll(async () => { if (owned.length) await db.delete(users).where(inArray(users.id, owned)); await pool.end(); });

describe("recipe persistence with real PostgreSQL", () => {
  it("deduplicates retries and allocates separate version numbers for parallel requests", async () => {
    const recipe = await createRecipe(owner, payload());
    const key = randomUUID();
    const [first, retry] = await Promise.all([
      createRecipeVersion(owner, recipe.id, key),
      createRecipeVersion(owner, recipe.id, key)
    ]);
    expect(first).toMatchObject({ id: key, recipeFamilyId: recipe.recipeFamilyId, versionNumber: 2, publicationState: "private" });
    expect(retry.id).toBe(first.id);

    const newVersions = await Promise.all([
      createRecipeVersion(owner, recipe.id, randomUUID()),
      createRecipeVersion(owner, first.id, randomUUID())
    ]);
    expect(newVersions.map(version => version.versionNumber).sort()).toEqual([3, 4]);
    expect(await db.query.recipes.findMany({ where: eq(recipes.recipeFamilyId, recipe.recipeFamilyId) })).toHaveLength(4);
  });
  it("rejects explicit invalid values without changing valid saved fields", async () => {
    const recipe = await createRecipe(owner, payload());
    for (const value of [0, -1, NaN, Infinity, -Infinity, 1e308]) {
      await expect(updateRecipe(owner, recipe.id, { batchSizeEnteredQuantity: value })).rejects.toThrow();
      expect((await getRecipeById(owner, recipe.id)).batchSizeEnteredQuantity).toBe(30);
    }
    for (const value of [0, -1, 1.5, Infinity]) {
      await expect(updateRecipe(owner, recipe.id, { boilTimeMinutes: value })).rejects.toThrow();
      expect((await getRecipeById(owner, recipe.id)).boilTimeMinutes).toBe(90);
    }
  });
  it("still fills omitted draft defaults and preserves omitted update fields", async () => {
    const draft = await createRecipe(owner, { title: "Loose draft" });
    expect(draft).toMatchObject({ batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l", boilTimeMinutes: 60, publicationState: "private" });
    const recipe = await createRecipe(owner, payload());
    expect(await updateRecipe(owner, recipe.id, { title: "Renamed" })).toMatchObject({ batchSizeEnteredQuantity: 30, boilTimeMinutes: 90 });
  });
  it("does not create a zero-volume recipe from positive input", async () => {
    await expect(createRecipe(owner, payload({ batchSizeEnteredQuantity: 0.0004 }))).rejects.toThrow();
    expect(await db.query.recipes.findMany({ where: eq(recipes.authorId, owner) })).toHaveLength(0);
  });
  it("keeps canonical milligrams through creation and unit changes", async () => {
    const recipe = await createRecipe(owner, payload({ ingredients: [line({ amountEnteredQuantity: 0.00004, amountEnteredUnit: "kg" })] }));
    for (const [amount, unit] of [[40, "mg"], [0.04, "g"], [0.00004, "kg"]] as const) {
      const detail = await updateRecipe(owner, recipe.id, { ingredients: [line({ persistentKey: recipe.ingredients[0].persistentKey, amountEnteredQuantity: amount, amountEnteredUnit: unit })] });
      expect(detail.ingredients[0]).toMatchObject({ amountEnteredQuantity: amount, amountEnteredUnit: unit, amountNormalizedQuantity: 0.04, amountNormalizedUnit: "g" });
    }
  });
  it("rejects duplicate keys before create or update, preserving the original line", async () => {
    const ingredient = line();
    await expect(createRecipe(owner, payload({ ingredients: [ingredient, ingredient] }))).rejects.toThrow();
    const recipe = await createRecipe(owner, payload({ ingredients: [ingredient] }));
    await expect(updateRecipe(owner, recipe.id, { ingredients: [{ ...ingredient, amountEnteredQuantity: 5 }, { ...ingredient, amountEnteredQuantity: 7 }] })).rejects.toThrow();
    const saved = await getRecipeById(owner, recipe.id);
    expect(saved.ingredients).toHaveLength(1);
    expect(saved.ingredients[0].amountEnteredQuantity).toBe(20);
  });
  it("rejects a stale revision without overwriting the first tab's confirmed edit", async () => {
    const recipe = await createRecipe(owner, payload());
    const first = await updateRecipe(owner, recipe.id, { title: "First tab saved", expectedUpdatedAt: recipe.editorUpdatedAt!.toISOString() });
    expect(first.updatedAt.getTime()).toBeGreaterThan(recipe.updatedAt.getTime());
    await expect(updateRecipe(owner, recipe.id, { title: recipe.title, batchSizeEnteredQuantity: 21, expectedUpdatedAt: recipe.editorUpdatedAt!.toISOString() })).rejects.toThrow("RECIPE_CONFLICT");
    expect(await getRecipeById(owner, recipe.id)).toMatchObject({ title: "First tab saved", batchSizeEnteredQuantity: 30 });
    const afterReload = await updateRecipe(owner, recipe.id, { batchSizeEnteredQuantity: 21, expectedUpdatedAt: first.editorUpdatedAt!.toISOString() });
    expect(afterReload).toMatchObject({ title: "First tab saved", batchSizeEnteredQuantity: 21 });
  });
  it("serializes concurrent writes with one revision so that exactly one succeeds", async () => {
    const recipe = await createRecipe(owner, payload());
    const results = await Promise.allSettled(["Tab A", "Tab B"].map(title => updateRecipe(owner, recipe.id, { title, expectedUpdatedAt: recipe.editorUpdatedAt!.toISOString() })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  });
  it("acknowledges an update retry once without reapplying it or changing its revision", async () => {
    const recipe = await createRecipe(owner, payload());
    const request = { title: "Committed before timeout", expectedUpdatedAt: recipe.editorUpdatedAt!.toISOString(), saveKey: randomUUID() };
    const first = await updateRecipe(owner, recipe.id, request);
    const again = await updateRecipe(owner, recipe.id, request);
    expect(again.title).toBe(first.title);
    expect(again.editorUpdatedAt).toEqual(first.editorUpdatedAt);
    expect(again.ingredients.map(line => line.id)).toEqual(first.ingredients.map(line => line.id));
    for (const laterUsesKey of [false, true]) {
      const later = await updateRecipe(owner, recipe.id, { title: "A later confirmed edit", ...(laterUsesKey ? { saveKey: randomUUID() } : {}) });
      await expect(updateRecipe(owner, recipe.id, request)).rejects.toThrow("RECIPE_CONFLICT");
      expect((await getRecipeById(owner, recipe.id)).editorUpdatedAt).toEqual(later.editorUpdatedAt);
    }
  });
  it("deduplicates concurrent update retries and does not let a known key bypass ownership", async () => {
    const recipe = await createRecipe(owner, payload());
    const request = { title: "One logical update", expectedUpdatedAt: recipe.editorUpdatedAt!.toISOString(), saveKey: randomUUID() };
    const results = await Promise.all(Array.from({ length: 3 }, () => updateRecipe(owner, recipe.id, request)));
    expect(new Set(results.map(row => row.editorUpdatedAt!.toISOString())).size).toBe(1);
    const foreign = (await completeEmailSignIn({ email: "qa.retry.foreign." + randomUUID() + "@localhost" })).id; owned.push(foreign);
    await expect(updateRecipe(foreign, recipe.id, request)).rejects.toThrow("NOT_FOUND");
    expect((await getRecipeById(owner, recipe.id)).title).toBe(request.title);
  });
  it("accepts an editor save after only image metadata changed the general timestamp", async () => {
    const recipe = await createRecipe(owner, payload());
    await db.update(recipes).set({ updatedAt: new Date(recipe.updatedAt.getTime() + 1000) }).where(eq(recipes.id, recipe.id));
    const saved = await updateRecipe(owner, recipe.id, { title: "After image metadata", expectedUpdatedAt: recipe.editorUpdatedAt!.toISOString() });
    expect(saved.title).toBe("After image metadata");
    expect(saved.editorUpdatedAt!.getTime()).toBeGreaterThan(recipe.editorUpdatedAt!.getTime());
  });
  it("replays one creation identity without overwriting subsequent saved edits", async () => {
    const key = randomUUID();
    const recipe = await createRecipe(owner, payload(), { idempotencyKey: key });
    expect(recipe.id).toBe(key);
    await updateRecipe(owner, recipe.id, { title: "Confirmed later edit" });
    const retried = await createRecipe(owner, payload({ title: "Stale retry" }), { idempotencyKey: key });
    expect(retried).toMatchObject({ id: recipe.id, title: "Confirmed later edit" });
    expect(await db.query.recipes.findMany({ where: eq(recipes.authorId, owner) })).toHaveLength(1);
  });
  it("creates exactly one recipe for simultaneous requests with one creation identity", async () => {
    const key = randomUUID();
    const results = await Promise.all(["Same request", "Same request", "Concurrent retry"].map(title => createRecipe(owner, payload({ title }), { idempotencyKey: key })));
    expect(new Set(results.map(recipe => recipe.id)).size).toBe(1);
    expect(await db.query.recipes.findMany({ where: eq(recipes.authorId, owner) })).toHaveLength(1);
  });
  it("rejects a creation identity belonging to a different author", async () => {
    const key = randomUUID();
    const recipe = await createRecipe(owner, payload(), { idempotencyKey: key });
    const stranger = (await completeEmailSignIn({ email: "qa.key.stranger." + randomUUID() + "@localhost" })).id; owned.push(stranger);
    await expect(createRecipe(stranger, payload({ title: "Foreign retry" }), { idempotencyKey: key })).rejects.toThrow("NOT_FOUND");
    expect((await getRecipeById(owner, recipe.id)).title).toBe(recipe.title);
  });
  it("rejects malformed creation identities without writing a recipe", async () => {
    await expect(createRecipe(owner, payload(), { idempotencyKey: "invalid" })).rejects.toThrow();
    expect(await db.query.recipes.findMany({ where: eq(recipes.authorId, owner) })).toHaveLength(0);
  });
  it("does not reveal or change a foreign private recipe even with its revision", async () => {
    const recipe = await createRecipe(owner, payload());
    const stranger = (await completeEmailSignIn({ email: "qa.stranger." + randomUUID() + "@localhost" })).id; owned.push(stranger);
    await expect(getRecipeById(stranger, recipe.id)).rejects.toThrow();
    await expect(updateRecipe(stranger, recipe.id, { title: "Foreign", expectedUpdatedAt: recipe.editorUpdatedAt!.toISOString() })).rejects.toThrow("NOT_FOUND");
    await expect(deleteRecipe(stranger, recipe.id)).rejects.toThrow("NOT_FOUND");
    expect((await getRecipeById(owner, recipe.id)).title).toBe(recipe.title);
  });
});
