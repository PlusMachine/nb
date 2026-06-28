import { and, asc, brewBatches, brewMeasurements, count, db, desc, eq, inArray, max, brewTelemetry, recipes } from "@nb/db";

import { getOwnedRecipeById } from "../recipes/service";
import { buildBrewPlanSnapshot } from "./brew-plan";
import { applyBrewDayStepPatch, buildBrewDaySteps, normalizeBrewDayProgress } from "./brew-day";
import { summarizeBrewMeasurements } from "./measurements";
import {
  activeBrewBatchStatuses,
  brewPlanSnapshotSchema,
  TELEMETRY_HISTORY_LIMIT,
  type ActiveBrewProgressItem,
  type BrewBatchDetail,
  type BrewBatchDto,
  type BrewBatchListItem,
  type BrewDayProgress,
  type BrewDayStepStatePatch,
  type BrewMeasurementDto,
  type TelemetryHistoryPoint
} from "./contracts";

const mapMeasurementDto = (row: typeof brewMeasurements.$inferSelect): BrewMeasurementDto => ({
  id: row.id,
  brewBatchId: row.brewBatchId,
  gravitySg: row.gravitySg,
  takenAt: row.takenAt,
  note: row.note,
  createdAt: row.createdAt
});

const mapBrewBatchDto = (row: typeof brewBatches.$inferSelect): BrewBatchDto => ({
  id: row.id,
  userId: row.userId,
  recipeId: row.recipeId,
  status: row.status,
  name: row.name,
  deviceId: row.deviceId,
  brewPlanSnapshot: brewPlanSnapshotSchema.parse(row.brewPlanSnapshot),
  brewDayProgress: normalizeBrewDayProgress(row.brewDayProgress),
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

// Колонки слим-проекции списка: только то, что читает mapBrewBatchListItem.
// Тяжёлые JSONB (equipmentProfileSnapshot/waterPlanSnapshot/deviceHints, notes) не
// тянем; brewPlanSnapshot/recipeSnapshot нужны для фолбэка названия рецепта.
const brewBatchListColumns = {
  id: true,
  name: true,
  status: true,
  recipeId: true,
  deviceId: true,
  brewPlanSnapshot: true,
  recipeSnapshot: true,
  plannedFor: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true
} as const;

// Слим-проекция строки варки в элемент списка (общая для списка варок и
// дашборда): название берём из снапшота рецепта → плана → имени партии.
const mapBrewBatchListItem = (
  row: Pick<typeof brewBatches.$inferSelect, keyof typeof brewBatchListColumns>
): BrewBatchListItem => {
  const planSnapshot = row.brewPlanSnapshot as { recipe?: { title?: string } } | null;
  const recipeSnapshot = row.recipeSnapshot as { title?: string } | null;
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    recipeId: row.recipeId,
    recipeTitle: recipeSnapshot?.title ?? planSnapshot?.recipe?.title ?? row.name,
    hasDevice: Boolean(row.deviceId),
    plannedFor: row.plannedFor,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
};

/** Все варки пользователя (для раздела «Варки»), новые сверху. Слим-проекция. */
export const listBrewBatchesForUser = async (userId: string): Promise<BrewBatchListItem[]> => {
  const rows = await db.query.brewBatches.findMany({
    where: eq(brewBatches.userId, userId),
    columns: brewBatchListColumns,
    orderBy: [desc(brewBatches.createdAt)]
  });

  return rows.map(mapBrewBatchListItem);
};

/**
 * Активные варки (planned/brewing/fermenting) для дашборда, с агрегатами журнала
 * замеров: последний замер и их число. Агрегат — один сгруппированный запрос по
 * всем активным партиям (без N+1), скоупленный по userId. Новые сверху.
 */
export const listActiveBrewBatchesForUser = async (userId: string): Promise<ActiveBrewProgressItem[]> => {
  const rows = await db.query.brewBatches.findMany({
    where: and(eq(brewBatches.userId, userId), inArray(brewBatches.status, activeBrewBatchStatuses)),
    columns: brewBatchListColumns,
    orderBy: [desc(brewBatches.createdAt)]
  });
  if (rows.length === 0) {
    return [];
  }

  const ids = rows.map((row) => row.id);
  const aggregates = await db
    .select({
      brewBatchId: brewMeasurements.brewBatchId,
      lastMeasurementAt: max(brewMeasurements.takenAt),
      measurementCount: count()
    })
    .from(brewMeasurements)
    .where(and(eq(brewMeasurements.userId, userId), inArray(brewMeasurements.brewBatchId, ids)))
    .groupBy(brewMeasurements.brewBatchId);
  const aggById = new Map(aggregates.map((row) => [row.brewBatchId, row]));

  return rows.map((row) => {
    const agg = aggById.get(row.id);
    return {
      ...mapBrewBatchListItem(row),
      lastMeasurementAt: agg?.lastMeasurementAt ?? null,
      measurementCount: agg?.measurementCount ?? 0
    };
  });
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

// --- Журнал замеров + заметки + цели ----------------------------------------

/** Замеры партии (ownership-checked), oldest→newest. Пусто, если партии нет/чужая. */
export const listBrewMeasurements = async (
  userId: string,
  brewBatchId: string
): Promise<BrewMeasurementDto[]> => {
  const batch = await getBrewBatchById(userId, brewBatchId);
  if (!batch) {
    return [];
  }
  const rows = await db
    .select()
    .from(brewMeasurements)
    .where(and(eq(brewMeasurements.brewBatchId, brewBatchId), eq(brewMeasurements.userId, userId)))
    .orderBy(asc(brewMeasurements.takenAt), asc(brewMeasurements.createdAt));
  return rows.map(mapMeasurementDto);
};

export const addBrewMeasurement = async (
  userId: string,
  brewBatchId: string,
  input: { gravitySg: number; takenAt?: Date | null; note?: string | null }
): Promise<BrewMeasurementDto> => {
  const batch = await getBrewBatchById(userId, brewBatchId);
  if (!batch) {
    throw new Error("NOT_FOUND");
  }
  const [created] = await db.insert(brewMeasurements).values({
    userId,
    brewBatchId,
    gravitySg: input.gravitySg,
    takenAt: input.takenAt ?? new Date(),
    note: input.note?.trim() || null
  }).returning();
  if (!created) {
    throw new Error("CREATE_FAILED");
  }
  return mapMeasurementDto(created);
};

export const deleteBrewMeasurement = async (
  userId: string,
  brewBatchId: string,
  measurementId: string
): Promise<void> => {
  const deleted = await db.delete(brewMeasurements).where(and(
    eq(brewMeasurements.id, measurementId),
    eq(brewMeasurements.brewBatchId, brewBatchId),
    eq(brewMeasurements.userId, userId)
  )).returning();
  if (deleted.length === 0) {
    throw new Error("NOT_FOUND");
  }
};

// --- Виртуальный гид варочного дня -------------------------------------------

/**
 * Обновляет состояние одного шага гида варочного дня (отметка done / старт
 * таймера). stepId валидируется против шагов плана — чужие ключи отклоняются,
 * чтобы JSONB не разрастался мусором. Возвращает обновлённый прогресс.
 */
export const setBrewDayStepState = async (
  userId: string,
  brewBatchId: string,
  stepId: string,
  patch: BrewDayStepStatePatch
): Promise<BrewDayProgress> => {
  // Атомарный read-modify-write: блокируем строку партии (SELECT … FOR UPDATE),
  // чтобы параллельные правки разных шагов не затирали друг друга (lost update).
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        brewPlanSnapshot: brewBatches.brewPlanSnapshot,
        brewDayProgress: brewBatches.brewDayProgress
      })
      .from(brewBatches)
      .where(and(eq(brewBatches.id, brewBatchId), eq(brewBatches.userId, userId)))
      .for("update");
    if (!row) {
      throw new Error("NOT_FOUND");
    }

    const snapshot = brewPlanSnapshotSchema.parse(row.brewPlanSnapshot);
    const stepIds = new Set(
      buildBrewDaySteps(snapshot).flatMap((group) => group.steps.map((step) => step.id))
    );
    if (!stepIds.has(stepId)) {
      throw new Error("UNKNOWN_STEP");
    }

    const now = new Date();
    const current = normalizeBrewDayProgress(row.brewDayProgress);
    const nextProgress = applyBrewDayStepPatch(current, stepId, patch, now.toISOString());

    const [updated] = await tx.update(brewBatches).set({
      brewDayProgress: nextProgress as unknown as Record<string, unknown>,
      updatedAt: now
    }).where(and(eq(brewBatches.id, brewBatchId), eq(brewBatches.userId, userId))).returning();
    if (!updated) {
      throw new Error("NOT_FOUND");
    }

    return normalizeBrewDayProgress(updated.brewDayProgress);
  });
};

export const updateBrewBatchNotes = async (
  userId: string,
  brewBatchId: string,
  notes: string | null
): Promise<BrewBatchDto> => {
  const [updated] = await db.update(brewBatches).set({
    notes: notes?.trim() || null,
    updatedAt: new Date()
  }).where(and(eq(brewBatches.id, brewBatchId), eq(brewBatches.userId, userId))).returning();
  if (!updated) {
    throw new Error("NOT_FOUND");
  }
  return mapBrewBatchDto(updated);
};

// Цели рецепта (расчётные og/fg/abv) для сравнения с фактом. Партия каскадно
// привязана к рецепту (recipeId, onDelete cascade), поэтому рецепт всегда есть.
const getRecipeBrewTargets = async (
  recipeId: string
): Promise<{ og: number | null; fg: number | null; abv: number | null } | null> => {
  const row = await db.query.recipes.findFirst({
    where: eq(recipes.id, recipeId),
    columns: { og: true, fg: true, abv: true }
  });
  return row ? { og: row.og, fg: row.fg, abv: row.abv } : null;
};

/** Сборка детальной страницы партии: партия + журнал + сводка (OG/FG/ABV vs цель). */
export const getBrewBatchDetail = async (
  userId: string,
  brewBatchId: string
): Promise<BrewBatchDetail | null> => {
  const batch = await getBrewBatchById(userId, brewBatchId);
  if (!batch) {
    return null;
  }
  const [measurements, targets] = await Promise.all([
    db.select().from(brewMeasurements)
      .where(and(eq(brewMeasurements.brewBatchId, brewBatchId), eq(brewMeasurements.userId, userId)))
      .orderBy(asc(brewMeasurements.takenAt), asc(brewMeasurements.createdAt))
      .then((rows) => rows.map(mapMeasurementDto)),
    getRecipeBrewTargets(batch.recipeId)
  ]);
  return {
    batch,
    measurements,
    summary: summarizeBrewMeasurements(measurements, targets)
  };
};
