import { lt } from "drizzle-orm";

import { and, asc, brewDevices, count, db, eq, fermentReadings, fermentSessions, gt, gte, lte, or } from "@nb/db";

import { addBrewMeasurement } from "@/features/brew-batches/service";

import {
  applySessionCalibrationSchema,
  CALIBRATION_NEARBY_WINDOW_MS,
  confirmGravityFromCurveSchema,
  CURVE_CONFIRM_MIN_POINTS,
  deleteSessionReadingsSchema,
  FG_CONFIRM_WINDOW_HOURS,
  FG_STABILITY_THRESHOLD_SG,
  OG_CONFIRM_WINDOW_HOURS,
  setReadingsExcludedSchema,
  updateSessionBoundsSchema,
  type ApplySessionCalibrationInput,
  type ConfirmGravityFromCurveInput,
  type ConfirmGravityFromCurveResult,
  type DeleteSessionDataResult,
  type DeleteSessionReadingsInput,
  type DeleteSessionReadingsResult,
  type FermentSessionEndReason,
  type PreviewGravityFromCurveResult,
  type SessionBoundsResult,
  type SessionCalibrationResult,
  type SetReadingsExcludedInput,
  type SetReadingsExcludedResult,
  type UpdateSessionBoundsInput
} from "./contracts";

// =============================================================================
//  features/device-streams — corrections.ts (F4, §5 ТЗ — «сердце ТЗ»)
//  Коррекции данных сеанса: офсет-калибровка (F4.1), исключение точек (F4.2),
//  границы сеанса (F4.3), подтверждение OG/FG с кривой (F4.4), удаления (F4.5).
//
//  Владение файлом (жёсткое разделение с параллельным исполнителем M3-C, UI):
//  НЕ трогает series.ts/components/* — только читает contracts.ts (свой),
//  brew-batches/service.ts (addBrewMeasurement, чужой read-only импорт).
//  sessions.ts/ingest.ts/service.ts тоже не трогаются и не импортируются —
//  ownership-проверка сеанса реализована здесь напрямую (getOwnedSessionRow),
//  зеркалит стиль getOwnedStreamDeviceRow из sessions.ts (плоский query-builder
//  db.select/insert/update/delete, без relational db.query.*).
//
//  Rate limit на мутациях не нужен (владельческие операции над своими данными,
//  задание явно это оговаривает) — но applySessionCalibration и
//  confirmGravityFromCurve трогают updatedAt сеанса (бейдж/подтверждение —
//  видимые пользователю события, стоит инвалидировать зависимые кэши по «свежести»).
//
//  `lt` — единственный оператор drizzle-orm, отсутствующий в барреле @nb/db
//  (там нет `lt`, только `gt`/`gte`/`lte`); импортируем напрямую из drizzle-orm,
//  по прецеденту apps/web/scripts/plan-brew-dev.ts (импортирует `like` так же).
// =============================================================================

type FermentSessionRow = typeof fermentSessions.$inferSelect;

/** Владение сеансом — существует и принадлежит userId (не проверяет устройство/партию отдельно, они неотделимы от сеанса). */
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

/** Имя устройства сеанса — отдельным запросом (не join), по стилю sessions.ts. Для note замера (F4.4). */
const getDeviceName = async (deviceId: string): Promise<string> => {
  const [device] = await db.select({ name: brewDevices.name }).from(brewDevices).where(eq(brewDevices.id, deviceId));
  return device?.name ?? "устройство";
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** Плотность округляется до 0.0001 SG (типичная точность ареометра) перед записью замера. */
const roundSg = (value: number): number => Math.round(value * 10_000) / 10_000;

type GravityPoint = { ts: Date; gravitySg: number };

/** Сырые (без офсета) не-excluded точки сеанса с известной гравитацией, по возрастанию ts. */
const fetchSessionGravityPoints = async (sessionId: string): Promise<GravityPoint[]> => {
  const rows = await db
    .select({ ts: fermentReadings.ts, gravitySg: fermentReadings.gravitySg })
    .from(fermentReadings)
    .where(and(eq(fermentReadings.sessionId, sessionId), eq(fermentReadings.excluded, false)))
    .orderBy(asc(fermentReadings.ts));
  return rows.filter((row): row is GravityPoint => row.gravitySg !== null);
};

/**
 * Показание устройства на момент targetMs (F4.1): линейная интерполяция между
 * соседними точками вокруг targetMs. Вне диапазона всех точек — берём ближайшую
 * (первую/последнюю), но только если она не дальше CALIBRATION_NEARBY_WINDOW_MS;
 * иначе CALIBRATION_NO_NEARBY_POINT. Точки должны быть отсортированы по ts.
 */
const findDeviceGravityAtTs = (points: GravityPoint[], targetMs: number): number => {
  let before: GravityPoint | null = null;
  let after: GravityPoint | null = null;
  for (const point of points) {
    const pointMs = point.ts.getTime();
    if (pointMs <= targetMs) before = point;
    if (pointMs >= targetMs && after === null) after = point;
  }

  if (before && after && before.ts.getTime() !== after.ts.getTime()) {
    const ratio = (targetMs - before.ts.getTime()) / (after.ts.getTime() - before.ts.getTime());
    return before.gravitySg + (after.gravitySg - before.gravitySg) * ratio;
  }
  if (before && after) {
    // before === after по времени: замер пришёлся точно на существующую точку.
    return before.gravitySg;
  }

  const nearest = before ?? after;
  if (!nearest || Math.abs(nearest.ts.getTime() - targetMs) > CALIBRATION_NEARBY_WINDOW_MS) {
    throw new Error("CALIBRATION_NO_NEARBY_POINT");
  }
  return nearest.gravitySg;
};

/**
 * F4.1 «Выровнять по моему замеру»: offset = measurementSg − rawDeviceSg
 * (интерполяция по СЫРЫМ значениям из БД — офсет применяется на чтении в
 * series.ts, здесь мы читаем ferment_readings напрямую, без него). Одна
 * актуальная величина на сеансе — перезапись, не накопление.
 */
export const applySessionCalibration = async (
  userId: string,
  input: ApplySessionCalibrationInput
): Promise<SessionCalibrationResult> => {
  const parsed = applySessionCalibrationSchema.parse(input);
  const session = await getOwnedSessionRow(userId, parsed.sessionId);

  const points = await fetchSessionGravityPoints(session.id);
  const rawDeviceSg = findDeviceGravityAtTs(points, parsed.measurementTs.getTime());
  const offsetSg = parsed.measurementSg - rawDeviceSg;
  const previousOffsetSg = session.calibrationOffsetSg;

  const [updated] = await db
    .update(fermentSessions)
    .set({ calibrationOffsetSg: offsetSg, updatedAt: new Date() })
    .where(and(eq(fermentSessions.id, session.id), eq(fermentSessions.userId, userId)))
    .returning();
  if (!updated) {
    throw new Error("SESSION_NOT_FOUND");
  }

  return { sessionId: session.id, deviceId: session.deviceId, brewBatchId: session.brewBatchId, offsetSg, previousOffsetSg };
};

/** Отмена калибровки («сбросить офсет») — офсет = 0, тот же бейдж-возврат, что applySessionCalibration. */
export const clearSessionCalibration = async (userId: string, sessionId: string): Promise<SessionCalibrationResult> => {
  const session = await getOwnedSessionRow(userId, sessionId);
  const previousOffsetSg = session.calibrationOffsetSg;

  await db
    .update(fermentSessions)
    .set({ calibrationOffsetSg: 0, updatedAt: new Date() })
    .where(and(eq(fermentSessions.id, sessionId), eq(fermentSessions.userId, userId)));

  return { sessionId: session.id, deviceId: session.deviceId, brewBatchId: session.brewBatchId, offsetSg: 0, previousOffsetSg };
};

/**
 * F4.2 «Исключить точки» / вернуть обратно (excluded=false тем же путём) —
 * UPDATE по диапазону ts точек сеанса. affected — число реально задетых строк
 * (для тоста-квитанции; может быть 0, если в диапазоне ничего нет — не ошибка).
 */
export const setReadingsExcluded = async (
  userId: string,
  input: SetReadingsExcludedInput
): Promise<SetReadingsExcludedResult> => {
  const parsed = setReadingsExcludedSchema.parse(input);
  const session = await getOwnedSessionRow(userId, parsed.sessionId);

  const affectedRows = await db
    .update(fermentReadings)
    .set({ excluded: parsed.excluded })
    .where(
      and(
        eq(fermentReadings.sessionId, parsed.sessionId),
        gte(fermentReadings.ts, parsed.fromTs),
        lte(fermentReadings.ts, parsed.toTs)
      )
    )
    .returning({ id: fermentReadings.id });

  return {
    sessionId: session.id,
    deviceId: session.deviceId,
    brewBatchId: session.brewBatchId,
    affected: affectedRows.length
  };
};

/**
 * F4.3 «Границы сеанса»: startedAt/endedAt задним числом. Инварианты держатся
 * на ИТОГОВОМ (после мержа с текущими значениями) состоянии, а не только когда
 * оба поля переданы разом — иначе можно было бы сдвинуть startedAt позже уже
 * существующего endedAt в один заход. Точки за новыми границами (ts < startedAt
 * или, если сеанс завершён, ts > endedAt) ОТВЯЗЫВАЮТСЯ от сеанса (session_id=NULL,
 * «обрезать шум» из спеки), не удаляются — обратимо ретро-привязкой (F2).
 *
 * Для АКТИВНОГО сеанса (endedAt был NULL) передача endedAt — это завершение
 * задним числом: end_reason проставляется 'manual'. Уже завершённый сеанс,
 * которому просто двигают endedAt/startedAt, свой endReason не меняет.
 */
export const updateSessionBounds = async (
  userId: string,
  sessionId: string,
  input: UpdateSessionBoundsInput
): Promise<SessionBoundsResult> => {
  const parsed = updateSessionBoundsSchema.parse(input);
  const session = await getOwnedSessionRow(userId, sessionId);

  const nextStartedAt = parsed.startedAt ?? session.startedAt;
  const nextEndedAt = parsed.endedAt !== undefined ? parsed.endedAt : session.endedAt;

  if (parsed.endedAt !== undefined && parsed.endedAt.getTime() > Date.now() + 60_000) {
    throw new Error("SESSION_BOUNDS_END_IN_FUTURE");
  }
  if (nextEndedAt && nextStartedAt.getTime() >= nextEndedAt.getTime()) {
    throw new Error("SESSION_BOUNDS_INVALID_RANGE");
  }

  const wasActive = session.endedAt === null;
  const becomesEnded = wasActive && nextEndedAt !== null;

  const [updated] = await db
    .update(fermentSessions)
    .set({
      startedAt: nextStartedAt,
      endedAt: nextEndedAt,
      endReason: becomesEnded ? "manual" : session.endReason,
      updatedAt: new Date()
    })
    .where(and(eq(fermentSessions.id, sessionId), eq(fermentSessions.userId, userId)))
    .returning();
  if (!updated) {
    throw new Error("SESSION_NOT_FOUND");
  }

  const outOfLowerBound = lt(fermentReadings.ts, nextStartedAt);
  const outOfBoundsCondition = nextEndedAt ? or(outOfLowerBound, gt(fermentReadings.ts, nextEndedAt)) : outOfLowerBound;

  const detachedRows = await db
    .update(fermentReadings)
    .set({ sessionId: null })
    .where(and(eq(fermentReadings.sessionId, sessionId), outOfBoundsCondition))
    .returning({ id: fermentReadings.id });

  return {
    sessionId: updated.id,
    deviceId: updated.deviceId,
    brewBatchId: updated.brewBatchId,
    startedAt: updated.startedAt,
    endedAt: updated.endedAt,
    endReason: (updated.endReason as FermentSessionEndReason | null) ?? null,
    detachedReadingsCount: detachedRows.length
  };
};

type CurveGravitySelection =
  | { ok: true; gravitySg: number; takenAt: Date }
  | { ok: false; reason: "insufficient_points" | "not_stable" };

/**
 * F4.4 — математика, общая для confirmGravityFromCurve (пишет замер) и
 * previewGravityFromCurve (M3-C, только подсматривает число для строки-
 * предложения, ничего не пишет): og — медиана первых OG_CONFIRM_WINDOW_HOURS
 * часов сеанса (минимум CURVE_CONFIRM_MIN_POINTS точек), takenAt — момент самой
 * ранней точки окна. fg — медиана последних FG_CONFIRM_WINDOW_HOURS часов ПРИ
 * УСЛОВИИ стабильности (размах ≤ FG_STABILITY_THRESHOLD_SG), takenAt — момент
 * самой свежей точки. Значения — по сырым точкам СО СДВИГОМ
 * calibration_offset_sg (это то, чему пользователь доверяет на графике —
 * выровненная по его же замеру кривая). Не бросает — вызывающий код сам решает,
 * как трактовать `ok: false` (confirm — конкретная ошибка, preview — null).
 */
const selectGravityFromCurve = async (session: FermentSessionRow, kind: "og" | "fg"): Promise<CurveGravitySelection> => {
  const rawPoints = await fetchSessionGravityPoints(session.id);
  const points = rawPoints.map((point) => ({ ts: point.ts, gravitySg: point.gravitySg + session.calibrationOffsetSg }));

  let selected: GravityPoint[];
  if (kind === "og") {
    const windowEndMs = session.startedAt.getTime() + OG_CONFIRM_WINDOW_HOURS * 3_600_000;
    selected = points.filter((point) => point.ts.getTime() <= windowEndMs);
    if (selected.length < CURVE_CONFIRM_MIN_POINTS) {
      return { ok: false, reason: "insufficient_points" };
    }
  } else {
    const lastPoint = points[points.length - 1];
    if (!lastPoint) {
      return { ok: false, reason: "insufficient_points" };
    }
    const windowStartMs = lastPoint.ts.getTime() - FG_CONFIRM_WINDOW_HOURS * 3_600_000;
    selected = points.filter((point) => point.ts.getTime() >= windowStartMs);
    if (selected.length < CURVE_CONFIRM_MIN_POINTS) {
      return { ok: false, reason: "insufficient_points" };
    }
    const values = selected.map((point) => point.gravitySg);
    const spread = Math.max(...values) - Math.min(...values);
    if (spread > FG_STABILITY_THRESHOLD_SG) {
      return { ok: false, reason: "not_stable" };
    }
  }

  const gravitySg = roundSg(median(selected.map((point) => point.gravitySg)));
  const takenAt = kind === "og" ? selected[0]!.ts : selected[selected.length - 1]!.ts;
  return { ok: true, gravitySg, takenAt };
};

/**
 * F4.4 «Записать OG/FG с ареометра?» — единственный путь, которым коррекции
 * пишут в brew_measurements (П2: автоматика никогда не пишет сама, только по
 * явному подтверждению). Математика выбора точек — selectGravityFromCurve.
 */
export const confirmGravityFromCurve = async (
  userId: string,
  input: ConfirmGravityFromCurveInput
): Promise<ConfirmGravityFromCurveResult> => {
  const parsed = confirmGravityFromCurveSchema.parse(input);
  const session = await getOwnedSessionRow(userId, parsed.sessionId);

  const selection = await selectGravityFromCurve(session, parsed.kind);
  if (!selection.ok) {
    throw new Error(selection.reason === "insufficient_points" ? "CURVE_INSUFFICIENT_POINTS" : "CURVE_NOT_STABLE");
  }

  const deviceName = await getDeviceName(session.deviceId);

  const measurement = await addBrewMeasurement(userId, session.brewBatchId, {
    gravitySg: selection.gravitySg,
    takenAt: selection.takenAt,
    note: `С устройства ${deviceName}`,
    isFinal: parsed.kind === "fg"
  });

  // Подтверждение — видимое пользователю событие на сеансе (см. заголовок файла); сам офсет не трогаем.
  await db
    .update(fermentSessions)
    .set({ updatedAt: new Date() })
    .where(and(eq(fermentSessions.id, session.id), eq(fermentSessions.userId, userId)));

  return { measurement, gravitySg: selection.gravitySg };
};

/**
 * F4.4 предпросмотр (M3-C) — «Записать OG 1.052 с ареометра?» в блоке «Брожение»
 * ДО подтверждения: та же математика (selectGravityFromCurve), но БЕЗ записи.
 * Недостаточно точек/нестабильная кривая → null (строка-предложение просто не
 * показывается, это не ошибка вызывающего серверного компонента); чужой/
 * несуществующий sessionId → тоже null по той же причине (не 500 на странице партии).
 */
export const previewGravityFromCurve = async (
  userId: string,
  input: ConfirmGravityFromCurveInput
): Promise<PreviewGravityFromCurveResult> => {
  const parsed = confirmGravityFromCurveSchema.parse(input);
  let session: FermentSessionRow;
  try {
    session = await getOwnedSessionRow(userId, parsed.sessionId);
  } catch {
    return null;
  }

  const selection = await selectGravityFromCurve(session, parsed.kind);
  return selection.ok ? selection.gravitySg : null;
};

/** Точки в диапазоне (или все точки сеанса, если границы не заданы) — счётчик ДО удаления, для ConfirmActionDialog. */
export const countSessionReadingsInRange = async (
  userId: string,
  sessionId: string,
  fromTs?: Date,
  toTs?: Date
): Promise<number> => {
  await getOwnedSessionRow(userId, sessionId);

  const conditions = [eq(fermentReadings.sessionId, sessionId)];
  if (fromTs) conditions.push(gte(fermentReadings.ts, fromTs));
  if (toTs) conditions.push(lte(fermentReadings.ts, toTs));

  const [row] = await db.select({ value: count() }).from(fermentReadings).where(and(...conditions));
  return row?.value ?? 0;
};

/** F4.5 «Удалить точки» — диапазон или все точки сеанса (сам сеанс остаётся). */
export const deleteSessionReadings = async (
  userId: string,
  input: DeleteSessionReadingsInput
): Promise<DeleteSessionReadingsResult> => {
  const parsed = deleteSessionReadingsSchema.parse(input);
  const session = await getOwnedSessionRow(userId, parsed.sessionId);

  const conditions = [eq(fermentReadings.sessionId, parsed.sessionId)];
  if (parsed.fromTs) conditions.push(gte(fermentReadings.ts, parsed.fromTs));
  if (parsed.toTs) conditions.push(lte(fermentReadings.ts, parsed.toTs));

  const deleted = await db
    .delete(fermentReadings)
    .where(and(...conditions))
    .returning({ id: fermentReadings.id });

  return { sessionId: session.id, deviceId: session.deviceId, brewBatchId: session.brewBatchId, deletedCount: deleted.length };
};

/**
 * F4.5 «Удалить данные сеанса» — точки сеанса + сам сеанс (устройство остаётся;
 * удаление устройства целиком — service.ts, не дублируется здесь).
 */
export const deleteSessionData = async (userId: string, sessionId: string): Promise<DeleteSessionDataResult> => {
  const session = await getOwnedSessionRow(userId, sessionId);

  const deletedReadings = await db
    .delete(fermentReadings)
    .where(eq(fermentReadings.sessionId, sessionId))
    .returning({ id: fermentReadings.id });

  await db.delete(fermentSessions).where(and(eq(fermentSessions.id, sessionId), eq(fermentSessions.userId, userId)));

  return {
    sessionId: session.id,
    deviceId: session.deviceId,
    brewBatchId: session.brewBatchId,
    deletedReadingsCount: deletedReadings.length
  };
};
