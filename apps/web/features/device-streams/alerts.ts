import { and, asc, brewBatches, db, eq, fermentReadings, fermentSessions, gte } from "@nb/db";
import { sendPushToUser, type PushPayload } from "@nb/push";

import { smoothGravityMedian5, type FermentPointCore } from "./series-core";
import { computeFermentVerdict, type FermentVerdict } from "./verdict-core";
import { track } from "./analytics";

// =============================================================================
//  features/device-streams — alerts.ts (§5 F6, M5-A)
//  Веб-пуш уведомления брожения, считающиеся на ingest. Вызывается ТОЛЬКО из
//  ingest.ts/ingest-rapt.ts, ПОСЛЕ успешной записи точки, с уже найденным
//  activeSessionId (не дублируем SELECT). Лучшая попытка целиком: любая ошибка
//  внутри (в т.ч. из sendPushToUser, который сам по себе best-effort и не
//  бросает в проде — see @nb/push/send.ts) гасится здесь и НЕ должна валить
//  ingest-роут (см. заголовок ingest.ts).
//
//  Владелец файла: НЕ трогает series.ts/corrections.ts (не импортирует их) —
//  только verdict-core.ts (computeFermentVerdict, разрешено импортировать) и
//  series-core.ts (smoothGravityMedian5 — чистое ядро сглаживания, отдельный
//  от series.ts файл, никаких ограничений на импорт).
// =============================================================================

export type AlertType = "not_started" | "possibly_stuck" | "likely_done" | "temp_out" | "battery_low";

/** Дедуп (§5 F6): не чаще одного пуша данного типа на сеанс за это окно. */
const DEDUP_WINDOW_MS = 12 * 60 * 60 * 1000;

/** Окно точек для вердикта — с запасом (verdict-core сам режет по своим окнам ≤48ч). */
const GRAVITY_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/** Окно точек для проверки температурного коридора — короче, коридор смотрит на «недавно». */
const TEMP_LOOKBACK_MS = 6 * 60 * 60 * 1000;

/** Выход за коридор дольше этого — кандидат temp_out (строго больше, §5 F6 «>30 мин»). */
const TEMP_OUT_MIN_DURATION_MS = 30 * 60 * 1000;

const BATTERY_LOW_VOLTAGE = 3.4;
const BATTERY_LOW_PCT = 20;

export type ProcessIngestAlertsInput = {
  deviceId: string;
  /** Активный сеанс устройства — уже найден вызывающим кодом (findActiveSessionId в ingest.ts/ingest-rapt.ts). null = сеанса нет, алерты не считаются. */
  sessionId: string | null;
  receivedAt: Date;
};

type SessionAlertRow = {
  id: string;
  userId: string;
  brewBatchId: string;
  startedAt: Date;
  alertsMuted: boolean;
  alertState: Record<string, string>;
  tempMinC: number | null;
  tempMaxC: number | null;
};

const fetchSessionRow = async (sessionId: string): Promise<SessionAlertRow | null> => {
  const [row] = await db
    .select({
      id: fermentSessions.id,
      userId: fermentSessions.userId,
      brewBatchId: fermentSessions.brewBatchId,
      startedAt: fermentSessions.startedAt,
      alertsMuted: fermentSessions.alertsMuted,
      alertState: fermentSessions.alertState,
      tempMinC: fermentSessions.tempMinC,
      tempMaxC: fermentSessions.tempMaxC
    })
    .from(fermentSessions)
    .where(eq(fermentSessions.id, sessionId));
  if (!row) return null;
  return { ...row, alertState: (row.alertState as Record<string, string> | null) ?? {} };
};

type BatchAlertInfo = { name: string; targetFg: number | null };

/** Имя партии + расчётный FG из recipeSnapshot (та же семантика, что targetFg в series.ts — маленький отдельный select, не завязываемся на чужой файл). */
const fetchBatchInfo = async (brewBatchId: string): Promise<BatchAlertInfo | null> => {
  const [row] = await db
    .select({ name: brewBatches.name, recipeSnapshot: brewBatches.recipeSnapshot })
    .from(brewBatches)
    .where(eq(brewBatches.id, brewBatchId));
  if (!row) return null;
  const targetFg = (row.recipeSnapshot as { fg?: number | null } | null)?.fg ?? null;
  return { name: row.name, targetFg };
};

type ReadingRow = {
  ts: Date;
  gravitySg: number | null;
  tempC: number | null;
  batteryV: number | null;
  batteryPct: number | null;
};

/** Не-excluded показания сеанса за окно назад от receivedAt, по возрастанию ts — один SELECT на все три проверки (вердикт/температура/батарея). */
const fetchRecentReadings = async (sessionId: string, sinceMs: number): Promise<ReadingRow[]> =>
  db
    .select({
      ts: fermentReadings.ts,
      gravitySg: fermentReadings.gravitySg,
      tempC: fermentReadings.tempC,
      batteryV: fermentReadings.batteryV,
      batteryPct: fermentReadings.batteryPct
    })
    .from(fermentReadings)
    .where(
      and(
        eq(fermentReadings.sessionId, sessionId),
        eq(fermentReadings.excluded, false),
        gte(fermentReadings.ts, new Date(sinceMs))
      )
    )
    .orderBy(asc(fermentReadings.ts));

const verdictToAlertType = (verdict: FermentVerdict): AlertType | null => {
  if (verdict.kind === "not_started") return "not_started";
  if (verdict.kind === "possibly_stuck") return "possibly_stuck";
  if (verdict.kind === "likely_done") return "likely_done";
  return null;
};

/**
 * Длительность (мс) непрерывного «вне коридора» участка в конце ряда (points —
 * по возрастанию ts): идём от последней точки назад, пока точки вне [min,max];
 * возвращает 0, если последняя точка в коридоре или точек < 2 (доказать
 * устойчивый выход не на чем).
 */
const findTempOutStreakMs = (points: { ts: number; tempC: number }[], min: number, max: number): number => {
  if (points.length === 0) return 0;
  const isOutside = (value: number) => value < min || value > max;
  const last = points[points.length - 1]!;
  if (!isOutside(last.tempC)) return 0;

  let earliestTs = last.ts;
  for (let i = points.length - 2; i >= 0; i--) {
    const point = points[i]!;
    if (!isOutside(point.tempC)) break;
    earliestTs = point.ts;
  }
  return last.ts - earliestTs;
};

/** Последняя точка с известной батареей (В ИЛИ %) — не обязательно самая свежая точка ряда вообще. */
const findLatestBattery = (rows: ReadingRow[]): { batteryV: number | null; batteryPct: number | null } | null => {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!;
    if (row.batteryV !== null || row.batteryPct !== null) {
      return { batteryV: row.batteryV, batteryPct: row.batteryPct };
    }
  }
  return null;
};

/** «24» либо «24.5» — без хвостового «.0» (тот же приём, что formatStepDurationDays в ferment-profile.ts). */
const fmtTemp = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

const formatBattery = (battery: { batteryV: number | null; batteryPct: number | null }): string =>
  battery.batteryV !== null ? `${battery.batteryV.toFixed(1)} В` : `${Math.round(battery.batteryPct!)}%`;

type AlertContext = {
  sessionId: string;
  batchId: string;
  batchName: string;
  stableDays?: number;
  tempC?: number;
  tempMinC?: number;
  tempMaxC?: number;
  batteryText?: string;
};

/**
 * Тексты пушей (§5 F6, П5 обязателен у likely_done). Заголовок везде несёт
 * контекст партии (по образцу «Похоже, добродило: <партия>» из спеки — этот
 * формат распространён на все пять типов ради единообразия), тело — суть/совет.
 */
const buildAlertPayload = (type: AlertType, ctx: AlertContext): PushPayload => {
  const url = `/app/brew-batches/${ctx.batchId}`;
  const tag = `ferment-${type}-${ctx.sessionId}`;

  switch (type) {
    case "not_started":
      return {
        title: `Брожение не началось?: ${ctx.batchName}`,
        body: "Прошло больше 36 часов, а плотность почти не изменилась — проверьте дрожжи.",
        tag,
        url
      };
    case "possibly_stuck":
      return {
        title: `Возможен затык: ${ctx.batchName}`,
        body: "Плотность стабильна, но выше расчётной — похоже, брожение остановилось.",
        tag,
        url
      };
    case "likely_done":
      return {
        title: `Похоже, добродило: ${ctx.batchName}`,
        body: `Стабильно ${ctx.stableDays} дн. Перед розливом подтвердите плотность ареометром.`,
        tag,
        url
      };
    case "temp_out":
      return {
        title: `Температура вне коридора: ${ctx.batchName}`,
        body: `Температура ${fmtTemp(ctx.tempC!)}°C вне коридора ${fmtTemp(ctx.tempMinC!)}–${fmtTemp(ctx.tempMaxC!)} °C.`,
        tag,
        url
      };
    case "battery_low":
      return {
        title: `Батарея садится: ${ctx.batchName}`,
        body: `Батарея ареометра садится (${ctx.batteryText}).`,
        tag,
        url
      };
  }
};

/** true — можно слать: типа ещё не было в alertState ИЛИ последняя отправка старше DEDUP_WINDOW_MS. */
const isDueForSend = (alertState: Record<string, string>, type: AlertType, nowMs: number): boolean => {
  const lastSentIso = alertState[type];
  if (!lastSentIso) return true;
  const lastSentMs = Date.parse(lastSentIso);
  return !Number.isFinite(lastSentMs) || nowMs - lastSentMs > DEDUP_WINDOW_MS;
};

/**
 * Посчитать и (best-effort) отправить веб-пуш алерты по свежепринятой точке
 * (§5 F6). Вызывается ПОСЛЕ INSERT в ferment_readings — сам по себе НИКОГДА не
 * бросает (внешний try/catch, console.error): падение алертов не должно
 * трогать ingest-ответ устройству.
 */
export const processIngestAlerts = async (input: ProcessIngestAlertsInput): Promise<void> => {
  try {
    if (!input.sessionId) return;

    const session = await fetchSessionRow(input.sessionId);
    if (!session || session.alertsMuted) return;

    const batch = await fetchBatchInfo(session.brewBatchId);
    if (!batch) return;

    const nowMs = input.receivedAt.getTime();
    const readings = await fetchRecentReadings(session.id, nowMs - GRAVITY_LOOKBACK_MS);

    // --- F5-вердикт (сглаженная кривая сеанса без excluded) ---
    const gravityCore: FermentPointCore[] = readings
      .filter((row) => row.gravitySg !== null)
      .map((row) => ({ ts: row.ts.getTime(), gravitySg: row.gravitySg, tempC: null, pressureKpa: null, excluded: false }));
    const smoothed = smoothGravityMedian5(gravityCore);
    const verdictPoints: { ts: number; gravitySg: number }[] = [];
    for (const point of smoothed) {
      if (point.gravitySg !== null) verdictPoints.push({ ts: point.ts, gravitySg: point.gravitySg });
    }
    const verdict = computeFermentVerdict({
      points: verdictPoints,
      sessionStartTs: session.startedAt.getTime(),
      targetFg: batch.targetFg,
      nowMs
    });
    const verdictAlert = verdictToAlertType(verdict);
    if (verdictAlert === "likely_done" && !session.alertState.likely_done) {
      // Первый раз за сеанс (до этого тика alertState.likely_done ещё не было) — §11 M5 PostHog-событие.
      track("verdict_likely_done", { sessionId: session.id });
    }

    // --- температурный коридор (§5 F6) ---
    let tempOutC: number | null = null;
    if (session.tempMinC !== null && session.tempMaxC !== null) {
      const tempPoints = readings
        .filter((row) => row.tempC !== null && row.ts.getTime() >= nowMs - TEMP_LOOKBACK_MS)
        .map((row) => ({ ts: row.ts.getTime(), tempC: row.tempC as number }));
      const streakMs = findTempOutStreakMs(tempPoints, session.tempMinC, session.tempMaxC);
      if (streakMs > TEMP_OUT_MIN_DURATION_MS) {
        tempOutC = tempPoints[tempPoints.length - 1]!.tempC;
      }
    }

    // --- батарея (§5 F6) ---
    const battery = findLatestBattery(readings);
    const batteryLow =
      battery !== null &&
      ((battery.batteryV !== null && battery.batteryV < BATTERY_LOW_VOLTAGE) ||
        (battery.batteryPct !== null && battery.batteryPct < BATTERY_LOW_PCT));

    const candidates: { type: AlertType; payload: PushPayload }[] = [];
    if (verdictAlert) {
      candidates.push({
        type: verdictAlert,
        payload: buildAlertPayload(verdictAlert, {
          sessionId: session.id,
          batchId: session.brewBatchId,
          batchName: batch.name,
          stableDays: verdict.kind === "likely_done" ? verdict.stableDays : undefined
        })
      });
    }
    if (tempOutC !== null) {
      candidates.push({
        type: "temp_out",
        payload: buildAlertPayload("temp_out", {
          sessionId: session.id,
          batchId: session.brewBatchId,
          batchName: batch.name,
          tempC: tempOutC,
          tempMinC: session.tempMinC!,
          tempMaxC: session.tempMaxC!
        })
      });
    }
    if (batteryLow && battery) {
      candidates.push({
        type: "battery_low",
        payload: buildAlertPayload("battery_low", {
          sessionId: session.id,
          batchId: session.brewBatchId,
          batchName: batch.name,
          batteryText: formatBattery(battery)
        })
      });
    }

    const dueForSend = candidates.filter(({ type }) => isDueForSend(session.alertState, type, nowMs));
    if (dueForSend.length === 0) return;

    for (const { type } of dueForSend) {
      track("alert_sent", { type });
    }

    for (const { payload } of dueForSend) {
      try {
        await sendPushToUser(session.userId, payload);
      } catch (error) {
        // sendPushToUser в проде сам best-effort и не бросает (@nb/push/send.ts) — этот catch
        // защищает именно от мока/будущего изменения контракта, чтобы один упавший тип не
        // остановил отправку остальных кандидатов этого же тика.
        console.error("[device-streams] processIngestAlerts: sendPushToUser упал:", error);
      }
    }

    // Один UPDATE на все отправленные типы (§5 F6) — дедуп считается «попыткой отправки»,
    // не подтверждённой доставкой (sendPushToUser сам решает судьбу конкретных подписок).
    const nextAlertState = { ...session.alertState };
    for (const { type } of dueForSend) {
      nextAlertState[type] = input.receivedAt.toISOString();
    }
    await db.update(fermentSessions).set({ alertState: nextAlertState }).where(eq(fermentSessions.id, session.id));
  } catch (error) {
    console.error("[device-streams] processIngestAlerts упал:", error);
  }
};
