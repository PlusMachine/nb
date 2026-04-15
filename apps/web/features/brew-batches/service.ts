import { and, brewBatches, db, desc, eq } from "@nb/db";

import { getOwnedRecipeById } from "../recipes/service";
import { buildBrewPlanSnapshot } from "./brew-plan";
import { brewPlanSnapshotSchema, type BrewBatchDto } from "./contracts";

const mapBrewBatchDto = (row: typeof brewBatches.$inferSelect): BrewBatchDto => ({
  id: row.id,
  userId: row.userId,
  recipeId: row.recipeId,
  status: row.status,
  name: row.name,
  brewPlanSnapshot: brewPlanSnapshotSchema.parse(row.brewPlanSnapshot),
  recipeSnapshot: (row.recipeSnapshot as Record<string, unknown> | null | undefined) ?? null,
  equipmentProfileSnapshot: (row.equipmentProfileSnapshot as Record<string, unknown> | null | undefined) ?? null,
  waterPlanSnapshot: (row.waterPlanSnapshot as Record<string, unknown> | null | undefined) ?? null,
  deviceHints: (row.deviceHints as Record<string, unknown>[] | null | undefined) ?? [],
  notes: row.notes,
  plannedFor: row.plannedFor,
  startedAt: row.startedAt,
  completedAt: row.completedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

export const createBrewBatchFromRecipe = async (
  userId: string,
  recipeId: string,
  input: { name?: string | null; plannedFor?: Date | null } = {}
) => {
  const recipe = await getOwnedRecipeById(userId, recipeId);
  const brewPlanSnapshot = buildBrewPlanSnapshot(recipe);
  const [created] = await db.insert(brewBatches).values({
    userId,
    recipeId: recipe.id,
    status: "planned",
    name: input.name?.trim() || `${recipe.title} brew`,
    brewPlanSnapshot,
    recipeSnapshot: {
      id: recipe.id,
      title: recipe.title,
      versionNumber: recipe.versionNumber,
      ingredients: recipe.ingredients.map((ingredient) => ({
        persistentKey: ingredient.persistentKey,
        displayName: ingredient.ingredientDisplayName ?? ingredient.ingredientDisplayNameSnapshot ?? null,
        amount: ingredient.amountEnteredQuantity,
        unit: ingredient.amountEnteredUnit,
        stage: ingredient.stage,
        timeOffset: ingredient.timeOffset
      }))
    },
    equipmentProfileSnapshot: recipe.equipmentProfileSnapshot ?? null,
    waterPlanSnapshot: recipe.waterPlanMeta ?? null,
    deviceHints: brewPlanSnapshot.deviceHints,
    plannedFor: input.plannedFor ?? null
  }).returning();

  if (!created) {
    throw new Error("CREATE_FAILED");
  }

  return mapBrewBatchDto(created);
};

export const listBrewBatchesForRecipe = async (userId: string, recipeId: string) => {
  const rows = await db.query.brewBatches.findMany({
    where: and(eq(brewBatches.userId, userId), eq(brewBatches.recipeId, recipeId)),
    orderBy: [desc(brewBatches.createdAt)]
  });

  return rows.map(mapBrewBatchDto);
};

export const updateBrewBatchStatus = async (
  userId: string,
  brewBatchId: string,
  status: typeof brewBatches.$inferSelect.status
) => {
  const now = new Date();
  const [updated] = await db.update(brewBatches).set({
    status,
    startedAt: status === "brewing" ? now : undefined,
    completedAt: status === "completed" ? now : undefined,
    updatedAt: now
  }).where(and(eq(brewBatches.id, brewBatchId), eq(brewBatches.userId, userId))).returning();

  if (!updated) {
    throw new Error("NOT_FOUND");
  }

  return mapBrewBatchDto(updated);
};
