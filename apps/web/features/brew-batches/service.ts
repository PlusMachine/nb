import { and, asc, brewBatches, brewMeasurements, count, db, desc, eq, gte, inArray, max, sql, brewTelemetry, recipes, users } from "@nb/db";

import { getRecipeById } from "../recipes/service";
import { buildBrewPlanSnapshot } from "./brew-plan";
import { applyBrewDayStepPatch, buildBrewDaySteps, normalizeBrewDayProgress } from "./brew-day";
import { summarizeBrewMeasurements } from "./measurements";
import {
  activeBrewBatchStatuses,
  brewPlanSnapshotSchema,
  FERMENT_HISTORY_LIMIT,
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

// Экспортирован для features/devices/fermenter-binding.ts (§8.4): привязка
// прибора-ферментера пишет brew_batches.deviceId и возвращает DTO без лишнего
// круговорота через getBrewBatchById — маппинг переиспользуется как есть.
export const mapBrewBatchDto = (row: typeof brewBatches.$inferSelect): BrewBatchDto => ({
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
  // Доступный рецепт: свой (любой статус) ИЛИ чужой published — БЕЗ клонирования.
  const recipe = await getRecipeById(userId, recipeId);
  const author = await db.query.users.findFirst({
    where: eq(users.id, recipe.authorId),
    columns: { displayName: true }
  });
  const brewPlanSnapshot = buildBrewPlanSnapshot(recipe);
  const [created] = await db.insert(brewBatches).values({
    userId,
    recipeId: recipe.id,
    status: "planned",
    name: input.name?.trim() || `${recipe.title} brew`,
    brewPlanSnapshot,
    // Самодостаточный слепок: таргеты og/fg/abv (сравнение план↔факт без живого
    // рецепта) + атрибуция автора («по рецепту X от Y», в т.ч. для чужого).
    recipeSnapshot: {
      id: recipe.id,
      title: recipe.title,
      versionNumber: recipe.versionNumber,
      og: recipe.og,
      fg: recipe.fg,
      abv: recipe.abv,
      authorId: recipe.authorId,
      authorName: author?.displayName ?? null,
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

/** Число варок пользователя (все статусы) одним индексным count — для стат-плитки дашборда. */
export const countBrewBatchesForUser = async (userId: string): Promise<number> => {
  const [row] = await db.select({ value: count() }).from(brewBatches).where(eq(brewBatches.userId, userId));
  return row?.value ?? 0;
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
 *
 * `windowDays` (§14, зеркалит getDeviceHistory в features/devices/service.ts):
 * график «план vs факт» ферментации (§8.4) живёт неделями, а мост персистит
 * FERMENT раз в 300 с (persist-gate.ts) — варочный лимит в 1000 точек укладывается
 * в ~3.5 суток. Передан `windowDays` → берём окно по времени с более широким
 * потолком (FERMENT_HISTORY_LIMIT); варочные вызовы (без windowDays) не меняются.
 */
export const getDeviceTelemetryHistory = async (
  deviceId: string,
  brewBatchId: string,
  limit: number = TELEMETRY_HISTORY_LIMIT,
  windowDays?: number
): Promise<TelemetryHistoryPoint[]> => {
  const hasWindow = typeof windowDays === "number" && windowDays > 0;
  const cap = hasWindow ? FERMENT_HISTORY_LIMIT : TELEMETRY_HISTORY_LIMIT;
  const bounded = Math.min(Math.max(Math.floor(limit) || 0, 1), cap);

  const conditions = [eq(brewTelemetry.deviceId, deviceId), eq(brewTelemetry.brewBatchId, brewBatchId)];
  if (hasWindow) {
    conditions.push(gte(brewTelemetry.ts, new Date(Date.now() - windowDays! * 86_400_000)));
  }

  // Берём последние N по ts (desc + limit), затем разворачиваем в oldest→newest.
  // appMode достаём из payload JSON (не отдельной колонкой) — тот же приём, что
  // listFermenterCandidates (features/devices/fermenter-binding.ts): нужен, чтобы
  // «Бродит в приборе» на акте «Брожение» (§8.4) знал по ПОСЛЕДНЕЙ точке этой же
  // выборки, ещё ли прибор в режиме ферментации, не гоняя отдельный запрос.
  const rows = await db
    .select({
      ts: brewTelemetry.ts,
      primaryC: brewTelemetry.primaryC,
      setpointC: brewTelemetry.setpointC,
      heatDutyPct: brewTelemetry.heatDutyPct,
      stage: brewTelemetry.stage,
      appMode: sql<number | null>`(${brewTelemetry.payload} ->> 'appMode')::int`
    })
    .from(brewTelemetry)
    .where(and(...conditions))
    .orderBy(desc(brewTelemetry.ts))
    .limit(bounded);

  return rows
    .map((row) => ({
      ts: row.ts.getTime(),
      primaryC: row.primaryC,
      setpointC: row.setpointC,
      heatDutyPct: row.heatDutyPct,
      stage: row.stage,
      appMode: row.appMode
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

// Цели рецепта (расчётные og/fg/abv) для сравнения с фактом. Берём из ЖИВОГО
// рецепта, а если его уже нет (recipeId=NULL после удаления/анпаблиша источника
// при варке без клона) — из снапшота партии: он самодостаточен.
const getRecipeBrewTargets = async (
  batch: Pick<BrewBatchDto, "recipeId" | "recipeSnapshot">
): Promise<{ og: number | null; fg: number | null; abv: number | null } | null> => {
  if (batch.recipeId) {
    const row = await db.query.recipes.findFirst({
      where: eq(recipes.id, batch.recipeId),
      columns: { og: true, fg: true, abv: true }
    });
    if (row) {
      return { og: row.og, fg: row.fg, abv: row.abv };
    }
  }
  const snapshot = batch.recipeSnapshot as { og?: number | null; fg?: number | null; abv?: number | null } | null;
  if (snapshot && (snapshot.og != null || snapshot.fg != null || snapshot.abv != null)) {
    return { og: snapshot.og ?? null, fg: snapshot.fg ?? null, abv: snapshot.abv ?? null };
  }
  return null;
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
    getRecipeBrewTargets(batch)
  ]);
  return {
    batch,
    measurements,
    summary: summarizeBrewMeasurements(measurements, targets)
  };
};
