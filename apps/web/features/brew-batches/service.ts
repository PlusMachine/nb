import { and, brewBatches, brewTelemetry, db, desc, eq } from "@nb/db";

import { getOwnedRecipeById } from "../recipes/service";
import { buildBrewPlanSnapshot } from "./brew-plan";
import {
  brewPlanSnapshotSchema,
  TELEMETRY_HISTORY_LIMIT,
  type BrewBatchDto,
  type TelemetryHistoryPoint
} from "./contracts";

const mapBrewBatchDto = (row: typeof brewBatches.$inferSelect): BrewBatchDto => ({
  id: row.id,
  userId: row.userId,
  recipeId: row.recipeId,
  status: row.status,
  name: row.name,
  deviceId: row.deviceId,
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

/** Достать партию варки по id с проверкой владения (или null, если нет/чужая). */
export const getBrewBatchById = async (
  userId: string,
  brewBatchId: string
): Promise<BrewBatchDto | null> => {
  const row = await db.query.brewBatches.findFirst({
    where: and(eq(brewBatches.id, brewBatchId), eq(brewBatches.userId, userId))
  });

  return row ? mapBrewBatchDto(row) : null;
};

export const listBrewBatchesForRecipe = async (userId: string, recipeId: string) => {
  const rows = await db.query.brewBatches.findMany({
    where: and(eq(brewBatches.userId, userId), eq(brewBatches.recipeId, recipeId)),
    orderBy: [desc(brewBatches.createdAt)]
  });

  return rows.map(mapBrewBatchDto);
};

/**
 * Историческая телеметрия КОНКРЕТНОЙ партии (для графиков), oldest→newest. Чистая
 * выборка БЕЗ проверки владения — вызывающий ОБЯЗАН сначала проверить, что
 * deviceId/brewBatchId принадлежат пользователю (через getBrewBatchById). Скоуп по
 * (deviceId, brewBatchId) гарантирует, что детальная страница партии не подмешает
 * телеметрию прошлой варки на том же устройстве. Ограничена TELEMETRY_HISTORY_LIMIT;
 * покрывает обе записи строк brew_telemetry — и облачный мост, и LAN/sim-даунсэмпл
 * из SSE-роута.
 */
export const getDeviceTelemetryHistory = async (
  deviceId: string,
  brewBatchId: string,
  limit: number = TELEMETRY_HISTORY_LIMIT
): Promise<TelemetryHistoryPoint[]> => {
  const bounded = Math.min(Math.max(Math.floor(limit) || 0, 1), TELEMETRY_HISTORY_LIMIT);
  // Берём последние N по ts (desc + limit), затем разворачиваем в oldest→newest.
  const rows = await db
    .select({
      ts: brewTelemetry.ts,
      primaryC: brewTelemetry.primaryC,
      setpointC: brewTelemetry.setpointC,
      heatDutyPct: brewTelemetry.heatDutyPct,
      stage: brewTelemetry.stage
    })
    .from(brewTelemetry)
    .where(and(eq(brewTelemetry.deviceId, deviceId), eq(brewTelemetry.brewBatchId, brewBatchId)))
    .orderBy(desc(brewTelemetry.ts))
    .limit(bounded);

  return rows
    .map((row) => ({
      ts: row.ts.getTime(),
      primaryC: row.primaryC,
      setpointC: row.setpointC,
      heatDutyPct: row.heatDutyPct,
      stage: row.stage
    }))
    .reverse();
};

/**
 * Историческая телеметрия партии (ownership-checked): резолвит партию по userId,
 * затем тянет историю её устройства. Пусто, если партии нет/чужая/без устройства.
 */
export const getBrewBatchTelemetryHistory = async (
  userId: string,
  brewBatchId: string,
  limit: number = TELEMETRY_HISTORY_LIMIT
): Promise<TelemetryHistoryPoint[]> => {
  const batch = await getBrewBatchById(userId, brewBatchId);
  if (!batch?.deviceId) {
    return [];
  }
  return getDeviceTelemetryHistory(batch.deviceId, batch.id, limit);
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
