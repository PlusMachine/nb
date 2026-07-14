import { assertRateLimit } from "@nb/auth";
import { and, asc, brewDevices, count, db, eq, fermentReadings, fermentSessions, gte, inArray, isNull, recipes } from "@nb/db";

import { getBrewBatchById } from "@/features/brew-batches/service";

import {
  createFermentSessionSchema,
  FERMENT_SESSION_CREATE_RATE_LIMIT,
  FERMENT_SESSION_CREATE_RATE_WINDOW_SECONDS,
  RETRO_ATTACH_WINDOW_MS,
  STREAM_LIKE_PROVIDER_IDS,
  updateSessionTempCorridorSchema,
  type AvailableStreamDeviceDto,
  type CreateFermentSessionInput,
  type FermentSessionDto,
  type FermentSessionEndReason,
  type ManualFermentSessionEndReason,
  type RetroAttachPreview,
  type SessionAlertsMutedResult,
  type SessionTempCorridorResult,
  type StreamHardwareKind,
  type UpdateSessionTempCorridorInput
} from "./contracts";

// =============================================================================
//  features/device-streams — sessions.ts (F2, §5 ТЗ)
//  Сеансы: устройство ↔ партия. Владение файлом (жёсткое разделение с
//  параллельным исполнителем): НЕ трогает service.ts/ingest.ts/components/*/
//  series*.ts — только читает brew-batches/service.ts (getBrewBatchById, чужой
//  read-only импорт) и devices-контракты (STREAM_LIKE_PROVIDER_IDS).
//
//  M4-B точечный фикс (разрешено владельцем задачи): ownership фильтровала
//  строго providerId==='stream' — RAPT-устройства (providerId='rapt-cloud',
//  M4) не проходили owned-проверку и не могли привязаться к партии. Теперь
//  фильтр — вхождение в STREAM_LIKE_PROVIDER_IDS (оба provider'а одинаково
//  «стрим-подобны» для сеансов).
//
//  Стиль запросов зеркалит ingest.ts (плоский query-builder db.select/insert/
//  update, без relational db.query.*) — обе точки входа в @nb/db в этой фиче
//  придерживаются одного стиля, что упрощает и переиспользование мысленной
//  модели, и мокинг в тестах.
// =============================================================================

type BrewDeviceRow = typeof brewDevices.$inferSelect;
type FermentSessionRow = typeof fermentSessions.$inferSelect;

/** Строка устройства: существует, принадлежит userId, это стрим-подобное устройство (stream|rapt-cloud, зеркалит service.ts). */
const getOwnedStreamDeviceRow = async (userId: string, deviceId: string): Promise<BrewDeviceRow> => {
  const [device] = await db
    .select()
    .from(brewDevices)
    .where(
      and(
        eq(brewDevices.id, deviceId),
        eq(brewDevices.userId, userId),
        inArray(brewDevices.providerId, [...STREAM_LIKE_PROVIDER_IDS])
      )
    );
  if (!device) {
    throw new Error("NOT_FOUND");
  }
  return device;
};

/** Партия пользователя (без ограничения по статусу — статус проверяется в вызывающем коде). */
const getOwnedBrewBatch = async (userId: string, brewBatchId: string) => {
  const batch = await getBrewBatchById(userId, brewBatchId);
  if (!batch) {
    throw new Error("NOT_FOUND");
  }
  return batch;
};

// =============================================================================
//  Предзаполнение температурного коридора (§5 F6) при создании сеанса: из
//  ЖИВОГО рецепта партии (recipes.processMeta.fermentationProfile.primaryTemperatureC),
//  а не из recipeSnapshot партии (в отличие от targetFg в series.ts/alerts.ts) —
//  спека §5 F6 явно называет источником профиль рецепта, снапшот тут ни при чём
//  (коридор — не факт варки, а совет по умолчанию, который логично брать из
//  актуального рецепта, если он ещё существует). Локальные чистые хелперы —
//  тот же приём, что brew-day.ts/ferment-profile.ts (колокированный ридер JSON,
//  без общего any-парсера), не импортируем ferment-profile.ts ради одного поля.
// =============================================================================

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readPrimaryTemperatureC = (processMeta: unknown): number | null => {
  if (!isRecord(processMeta)) return null;
  const profile = processMeta.fermentationProfile;
  if (!isRecord(profile)) return null;
  const value = profile.primaryTemperatureC;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

/** Округление до 0.5 °C (§5 F6: «округли до 0.5»). */
const roundToHalf = (value: number): number => Math.round(value * 2) / 2;

/**
 * Коридор алертов нового сеанса (§5 F6): явный input.tempMinC/tempMaxC
 * приоритетнее автопредзаполнения; иначе — из профиля брожения ЖИВОГО рецепта
 * партии (primary±2°C, если рецепт/профиль ещё существуют), иначе — коридор не
 * задан (алерт temp_out выключен, не ошибка).
 */
const resolveTempCorridor = async (
  parsed: CreateFermentSessionInput,
  recipeId: string | null
): Promise<{ tempMinC: number | null; tempMaxC: number | null }> => {
  if (parsed.tempMinC !== undefined || parsed.tempMaxC !== undefined) {
    return { tempMinC: parsed.tempMinC ?? null, tempMaxC: parsed.tempMaxC ?? null };
  }
  if (!recipeId) {
    return { tempMinC: null, tempMaxC: null };
  }

  const [recipeRow] = await db.select({ processMeta: recipes.processMeta }).from(recipes).where(eq(recipes.id, recipeId));
  const primaryTemperatureC = readPrimaryTemperatureC(recipeRow?.processMeta ?? null);
  if (primaryTemperatureC === null) {
    return { tempMinC: null, tempMaxC: null };
  }

  return { tempMinC: roundToHalf(primaryTemperatureC - 2), tempMaxC: roundToHalf(primaryTemperatureC + 2) };
};

/** Активный (ещё не завершённый) сеанс устройства — денормализация/busy-check. */
const findActiveSessionRow = async (deviceId: string): Promise<FermentSessionRow | null> => {
  const [row] = await db
    .select()
    .from(fermentSessions)
    .where(and(eq(fermentSessions.deviceId, deviceId), isNull(fermentSessions.endedAt)));
  return row ?? null;
};

/** Postgres-конфликт партиального уникального индекса (§6.2) — страховка поверх предварительного SELECT. */
const isActiveSessionConflict = (error: unknown): boolean =>
  error instanceof Error
  && (error.message.includes("ferment_sessions_active_device_uidx") || (error as { code?: string }).code === "23505");

/** Непривязанные (session_id IS NULL) показания устройства за RETRO_ATTACH_WINDOW_MS, по возрастанию ts. */
const findRetroCandidateTimestamps = async (deviceId: string, now: Date): Promise<Date[]> => {
  const cutoff = new Date(now.getTime() - RETRO_ATTACH_WINDOW_MS);
  const rows = await db
    .select({ ts: fermentReadings.ts })
    .from(fermentReadings)
    .where(and(eq(fermentReadings.deviceId, deviceId), isNull(fermentReadings.sessionId), gte(fermentReadings.ts, cutoff)))
    .orderBy(asc(fermentReadings.ts));
  return rows.map((row) => row.ts);
};

/** Точек в сеансе — единичный счётчик (у нового сеанса их 0 или несколько сразу после ретро-привязки). */
const countSessionReadings = async (sessionId: string): Promise<number> => {
  const [row] = await db.select({ value: count() }).from(fermentReadings).where(eq(fermentReadings.sessionId, sessionId));
  return row?.value ?? 0;
};

/** Счётчики точек для набора сеансов одним запросом (без N+1) — агрегация в JS, объём точек мал (§6.3, ≤~4000/сеанс). */
const countReadingsBySession = async (sessionIds: string[]): Promise<Map<string, number>> => {
  if (sessionIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({ sessionId: fermentReadings.sessionId })
    .from(fermentReadings)
    .where(inArray(fermentReadings.sessionId, sessionIds));
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.sessionId) continue;
    counts.set(row.sessionId, (counts.get(row.sessionId) ?? 0) + 1);
  }
  return counts;
};

/** Имя/вид устройств для набора id одним запросом. */
const fetchDeviceInfoByIds = async (
  deviceIds: string[]
): Promise<Map<string, { name: string; hardwareKind: StreamHardwareKind | null }>> => {
  if (deviceIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({ id: brewDevices.id, name: brewDevices.name, hardwareKind: brewDevices.hardwareKind })
    .from(brewDevices)
    .where(inArray(brewDevices.id, deviceIds));
  return new Map(rows.map((row) => [row.id, { name: row.name, hardwareKind: (row.hardwareKind as StreamHardwareKind | null) ?? null }]));
};

const mapFermentSessionRow = (
  row: FermentSessionRow,
  device: { name: string; hardwareKind: StreamHardwareKind | null },
  readingsCount: number
): FermentSessionDto => ({
  id: row.id,
  userId: row.userId,
  deviceId: row.deviceId,
  deviceName: device.name,
  deviceHardwareKind: device.hardwareKind,
  brewBatchId: row.brewBatchId,
  startedAt: row.startedAt,
  endedAt: row.endedAt,
  endReason: (row.endReason as FermentSessionEndReason | null) ?? null,
  calibrationOffsetSg: row.calibrationOffsetSg,
  tempMinC: row.tempMinC,
  tempMaxC: row.tempMaxC,
  alertsMuted: row.alertsMuted,
  readingsCount,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

/** Устройство «удалено» — защитный фолбэк: FK cascade делает это недостижимым в реальной БД (сеанс не переживает устройство). */
const DELETED_DEVICE_FALLBACK = { name: "Устройство удалено", hardwareKind: null as StreamHardwareKind | null };

/** Обогатить строки сеансов именем/видом устройства и счётчиком точек, без N+1 запросов. */
const mapSessionRows = async (rows: FermentSessionRow[]): Promise<FermentSessionDto[]> => {
  const deviceIds = [...new Set(rows.map((row) => row.deviceId))];
  const sessionIds = rows.map((row) => row.id);
  const [devices, readingCounts] = await Promise.all([fetchDeviceInfoByIds(deviceIds), countReadingsBySession(sessionIds)]);
  return rows.map((row) => mapFermentSessionRow(row, devices.get(row.deviceId) ?? DELETED_DEVICE_FALLBACK, readingCounts.get(row.id) ?? 0));
};

const byStartedAtDesc = (a: FermentSessionRow, b: FermentSessionRow): number => b.startedAt.getTime() - a.startedAt.getTime();

/**
 * Создать сеанс (F2, все три точки входа §5): владение устройством+партией,
 * партия в статусе fermenting/brewing, не более одного активного сеанса на
 * устройство (SESSION_DEVICE_BUSY — и предварительным SELECT, и страховкой на
 * конфликте уникального индекса при гонке двух параллельных запросов).
 *
 * Ретро-привязка (retroAttach=true): startedAt сеанса = min(ts) непривязанных
 * показаний устройства за последние 7 дней, если такие есть; иначе — как без
 * ретро-привязки (input.startedAt ?? now). После вставки сеанса непривязанные
 * показания устройства с ts >= startedAt доприсваиваются ему одним UPDATE.
 */
export const createFermentSession = async (userId: string, input: CreateFermentSessionInput): Promise<FermentSessionDto> => {
  const parsed = createFermentSessionSchema.parse(input);

  const device = await getOwnedStreamDeviceRow(userId, parsed.deviceId);
  const batch = await getOwnedBrewBatch(userId, parsed.brewBatchId);

  if (batch.status !== "fermenting" && batch.status !== "brewing") {
    throw new Error("SESSION_INVALID_BATCH_STATUS");
  }

  await assertRateLimit(userId, "ferment_session_create", FERMENT_SESSION_CREATE_RATE_LIMIT, FERMENT_SESSION_CREATE_RATE_WINDOW_SECONDS);

  const existingActive = await findActiveSessionRow(device.id);
  if (existingActive) {
    throw new Error("SESSION_DEVICE_BUSY");
  }

  const tempCorridor = await resolveTempCorridor(parsed, batch.recipeId);

  const now = new Date();
  let startedAt = parsed.startedAt ?? now;
  let retroTimestamps: Date[] = [];
  if (parsed.retroAttach) {
    retroTimestamps = await findRetroCandidateTimestamps(device.id, now);
    if (retroTimestamps.length > 0) {
      startedAt = retroTimestamps[0]!;
    }
    // Нет непривязанных точек за 7 дней — startedAt остаётся input.startedAt ?? now (§5): привязывать
    // задним числом нечего, новые точки денормализуются в сеанс уже в ingest.ts.
  }

  let inserted: FermentSessionRow | undefined;
  try {
    [inserted] = await db
      .insert(fermentSessions)
      .values({
        userId,
        deviceId: device.id,
        brewBatchId: batch.id,
        startedAt,
        tempMinC: tempCorridor.tempMinC,
        tempMaxC: tempCorridor.tempMaxC
      })
      .returning();
  } catch (error) {
    if (isActiveSessionConflict(error)) {
      throw new Error("SESSION_DEVICE_BUSY");
    }
    throw error;
  }
  if (!inserted) {
    throw new Error("SESSION_CREATE_FAILED");
  }

  if (parsed.retroAttach && retroTimestamps.length > 0) {
    await db
      .update(fermentReadings)
      .set({ sessionId: inserted.id })
      .where(and(eq(fermentReadings.deviceId, device.id), isNull(fermentReadings.sessionId), gte(fermentReadings.ts, startedAt)));
  }

  const readingsCount = await countSessionReadings(inserted.id);
  return mapFermentSessionRow(
    inserted,
    { name: device.name, hardwareKind: (device.hardwareKind as StreamHardwareKind | null) ?? null },
    readingsCount
  );
};

/** Промпт «Забрать данные с … (за N часов, M точек)?» до создания сеанса — без побочных эффектов. */
export const previewRetroAttach = async (userId: string, deviceId: string): Promise<RetroAttachPreview> => {
  await getOwnedStreamDeviceRow(userId, deviceId);
  const timestamps = await findRetroCandidateTimestamps(deviceId, new Date());
  return {
    count: timestamps.length,
    oldestTs: timestamps[0] ?? null,
    newestTs: timestamps[timestamps.length - 1] ?? null
  };
};

/**
 * Завершить сеанс. Идемпотентно: уже завершённый сеанс возвращается как есть
 * (не ошибка) — повторный клик/двойной сабмит формы не должен падать.
 */
export const endFermentSession = async (
  userId: string,
  sessionId: string,
  reason: ManualFermentSessionEndReason
): Promise<FermentSessionDto> => {
  const [row] = await db.select().from(fermentSessions).where(and(eq(fermentSessions.id, sessionId), eq(fermentSessions.userId, userId)));
  if (!row) {
    throw new Error("NOT_FOUND");
  }

  if (row.endedAt) {
    const [dto] = await mapSessionRows([row]);
    return dto!;
  }

  const [updated] = await db
    .update(fermentSessions)
    .set({ endedAt: new Date(), endReason: reason, updatedAt: new Date() })
    .where(and(eq(fermentSessions.id, sessionId), eq(fermentSessions.userId, userId)))
    .returning();
  if (!updated) {
    throw new Error("NOT_FOUND");
  }

  const [dto] = await mapSessionRows([updated]);
  return dto!;
};

/** Завершить все активные сеансы партии разом (промпт при переводе партии в «Завершена» — их может быть несколько). */
export const endActiveSessionsForBatch = async (
  userId: string,
  brewBatchId: string,
  reason: ManualFermentSessionEndReason
): Promise<FermentSessionDto[]> => {
  await getOwnedBrewBatch(userId, brewBatchId);

  const updatedRows = await db
    .update(fermentSessions)
    .set({ endedAt: new Date(), endReason: reason, updatedAt: new Date() })
    .where(and(eq(fermentSessions.brewBatchId, brewBatchId), eq(fermentSessions.userId, userId), isNull(fermentSessions.endedAt)))
    .returning();

  return mapSessionRows(updatedRows);
};

/** Сеансы партии, свежие сверху (в т.ч. параллельные — легитимный сценарий §5 F2). */
export const listSessionsForBatch = async (userId: string, brewBatchId: string): Promise<FermentSessionDto[]> => {
  await getOwnedBrewBatch(userId, brewBatchId);

  const rows = await db
    .select()
    .from(fermentSessions)
    .where(and(eq(fermentSessions.brewBatchId, brewBatchId), eq(fermentSessions.userId, userId)));

  return mapSessionRows([...rows].sort(byStartedAtDesc));
};

/** Сеансы устройства (история на карточке устройства, §5 F3), свежие сверху. */
export const listSessionsForDevice = async (userId: string, deviceId: string): Promise<FermentSessionDto[]> => {
  await getOwnedStreamDeviceRow(userId, deviceId);

  const rows = await db
    .select()
    .from(fermentSessions)
    .where(and(eq(fermentSessions.deviceId, deviceId), eq(fermentSessions.userId, userId)));

  return mapSessionRows([...rows].sort(byStartedAtDesc));
};

export const getActiveSessionForDevice = async (userId: string, deviceId: string): Promise<FermentSessionDto | null> => {
  await getOwnedStreamDeviceRow(userId, deviceId);
  const row = await findActiveSessionRow(deviceId);
  if (!row) {
    return null;
  }
  const [dto] = await mapSessionRows([row]);
  return dto ?? null;
};

/**
 * Стрим-устройства пользователя БЕЗ активного сеанса (шаг «Ареометр уже в
 * сусле?» при переводе партии в «Брожение» + строка «Подключить ареометр»).
 * hasRetroReadings — есть ли что предложить забрать ретро-привязкой при
 * создании сеанса (бейдж, без похода за самими точками).
 */
export const listAvailableStreamDevices = async (userId: string): Promise<AvailableStreamDeviceDto[]> => {
  const devices = await db
    .select()
    .from(brewDevices)
    .where(and(eq(brewDevices.userId, userId), inArray(brewDevices.providerId, [...STREAM_LIKE_PROVIDER_IDS])));
  if (devices.length === 0) {
    return [];
  }

  const activeRows = await db
    .select({ deviceId: fermentSessions.deviceId })
    .from(fermentSessions)
    .where(and(eq(fermentSessions.userId, userId), isNull(fermentSessions.endedAt)));
  const busyDeviceIds = new Set(activeRows.map((row) => row.deviceId));

  const freeDevices = devices.filter((device) => !busyDeviceIds.has(device.id));
  if (freeDevices.length === 0) {
    return [];
  }

  const cutoff = new Date(Date.now() - RETRO_ATTACH_WINDOW_MS);
  const retroRows = await db
    .select({ deviceId: fermentReadings.deviceId })
    .from(fermentReadings)
    .where(
      and(
        inArray(
          fermentReadings.deviceId,
          freeDevices.map((device) => device.id)
        ),
        isNull(fermentReadings.sessionId),
        gte(fermentReadings.ts, cutoff)
      )
    );
  const retroDeviceIds = new Set(retroRows.map((row) => row.deviceId));

  return freeDevices.map((device) => ({
    id: device.id,
    name: device.name,
    hardwareKind: (device.hardwareKind as StreamHardwareKind | null) ?? null,
    lastSeenAt: device.lastSeenAt,
    hasRetroReadings: retroDeviceIds.has(device.id)
  }));
};

// =============================================================================
//  §5 F6 — коридор алертов и тумблер «Уведомления» на активном сеансе. Владение
//  сеансом — тот же принцип, что getOwnedStreamDeviceRow/getOwnedBrewBatch выше
//  (существует и принадлежит userId); отдельный локальный хелпер, а не импорт
//  getOwnedSessionRow из corrections.ts (чужой файл, не трогаем и не тянем).
// =============================================================================

const getOwnedSessionRow = async (userId: string, sessionId: string): Promise<FermentSessionRow> => {
  const [row] = await db
    .select()
    .from(fermentSessions)
    .where(and(eq(fermentSessions.id, sessionId), eq(fermentSessions.userId, userId)));
  if (!row) {
    throw new Error("SESSION_NOT_FOUND");
  }
  return row;
};

/**
 * «Изменить коридор» (§5 F6): min/max либо оба числа (min<max), либо оба null
 * (снять коридор — алерт temp_out выключается, не ошибка). Один из двух без
 * другого (одно число, другое null) невалиден — коридору нужна пара границ.
 */
export const updateSessionTempCorridor = async (
  userId: string,
  sessionId: string,
  input: UpdateSessionTempCorridorInput
): Promise<SessionTempCorridorResult> => {
  const parsed = updateSessionTempCorridorSchema.parse(input);
  const session = await getOwnedSessionRow(userId, sessionId);

  if ((parsed.tempMinC === null) !== (parsed.tempMaxC === null)) {
    throw new Error("SESSION_TEMP_CORRIDOR_INCOMPLETE");
  }
  if (parsed.tempMinC !== null && parsed.tempMaxC !== null && parsed.tempMinC >= parsed.tempMaxC) {
    throw new Error("SESSION_TEMP_CORRIDOR_INVALID_RANGE");
  }

  const [updated] = await db
    .update(fermentSessions)
    .set({ tempMinC: parsed.tempMinC, tempMaxC: parsed.tempMaxC, updatedAt: new Date() })
    .where(and(eq(fermentSessions.id, sessionId), eq(fermentSessions.userId, userId)))
    .returning();
  if (!updated) {
    throw new Error("SESSION_NOT_FOUND");
  }

  return {
    sessionId: session.id,
    deviceId: session.deviceId,
    brewBatchId: session.brewBatchId,
    tempMinC: updated.tempMinC,
    tempMaxC: updated.tempMaxC
  };
};

/** Тумблер «Уведомления» (§5 F6) — мьютит/размьючивает ВСЕ алерты сеанса разом (не по типу — MVP). */
export const setSessionAlertsMuted = async (
  userId: string,
  sessionId: string,
  muted: boolean
): Promise<SessionAlertsMutedResult> => {
  const session = await getOwnedSessionRow(userId, sessionId);

  await db
    .update(fermentSessions)
    .set({ alertsMuted: muted, updatedAt: new Date() })
    .where(and(eq(fermentSessions.id, sessionId), eq(fermentSessions.userId, userId)));

  return { sessionId: session.id, deviceId: session.deviceId, brewBatchId: session.brewBatchId, alertsMuted: muted };
};
