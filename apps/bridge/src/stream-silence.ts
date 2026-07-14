// =============================================================================
//  apps/bridge — stream-silence.ts
//  M5-B (docs/specs/third-party-fermentation-devices.md §5 F6 «Поплавок молчит»,
//  F2 автозавершение сеанса по молчанию): периодический скан активных сеансов
//  стрим/RAPT-устройств (главный вход — main.ts, раз в 10 мин). Паттерн — как
//  watchdog.ts/cloud-deadman.ts: чистая функция решения (decideSilenceActions,
//  testable без БД) + отдельный async-раннер с I/O (БД-выборка, автозавершение,
//  пуш), best-effort — ошибки не роняют мост.
//
//  Состояние дедупа пуша «молчит» — in-memory Map<sessionId, notifiedAtMs>, живёт
//  пока жив процесс моста (тот же паттерн, что `tracked`/`alerted` в watchdog.ts/
//  cloud-deadman.ts). ⚠ Рестарт моста теряет память дедупа: активный «молчащий»
//  сеанс может получить повторный пуш после рестарта — тот же принятый компромисс,
//  что у офлайн-watchdog ферментации (см. комментарий watchdog.ts).
// =============================================================================
import { sendPushToUser, streamSilenceAutoEndedNotification, streamSilenceNotification } from "@nb/push";

import { endStreamSessionBySilence, getActiveStreamSilenceCandidates, type StreamSilenceCandidateRow } from "./db.js";

const HOUR_MS = 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * HOUR_MS;
const SILENCE_INTERVAL_MULTIPLIER = 6;
const AUTO_END_SILENCE_MS = 7 * 24 * HOUR_MS;

/**
 * Порог «молчит» (§5 F6): max(2 ч, 6× заявленный интервал устройства из
 * payload.interval последней точки). Интервал неизвестен/невалиден (≤0) → эффективно
 * просто 2 ч (6×0 не участвует в max).
 */
export function silenceThresholdMs(intervalSeconds: number | null): number {
  const byInterval =
    intervalSeconds !== null && intervalSeconds > 0 ? intervalSeconds * 1000 * SILENCE_INTERVAL_MULTIPLIER : 0;
  return Math.max(TWO_HOURS_MS, byInterval);
}

export interface SilenceAction {
  row: StreamSilenceCandidateRow;
  /** Сколько часов молчит устройство на момент решения (для тела пуша/лога). */
  silentHours: number;
}

export interface SilenceDecision {
  /** Разовый пуш «молчит»: старше порога, младше 7 суток, не в Map, не заглушен. */
  toNotify: SilenceAction[];
  /** Молчит дольше 7 суток — автозавершить (независимо от alerts_muted сеанса). */
  toAutoEnd: SilenceAction[];
  /** sessionId, которые нужно убрать из Map дедупа (связь восстановилась ИЛИ сеанс больше не активен). */
  toClear: string[];
}

/**
 * Чистое решение по строкам скана + текущему состоянию дедупа — без I/O, юнит-тест
 * без БД (см. низ файла/отчёт агента). `rows` — ТОЛЬКО активные сеансы (ended_at is
 * null) на момент скана.
 */
export function decideSilenceActions(
  rows: StreamSilenceCandidateRow[],
  notifiedState: ReadonlyMap<string, number>,
  nowMs: number,
): SilenceDecision {
  const toNotify: SilenceAction[] = [];
  const toAutoEnd: SilenceAction[] = [];
  const toClear: string[] = [];
  const seenSessionIds = new Set<string>();

  for (const row of rows) {
    seenSessionIds.add(row.sessionId);

    // lastSeenAt устройства ещё null (пакетов не было вовсе) — считаем молчание от
    // старта сеанса, а не притворяемся, что оно бесконечно.
    const referenceMs = row.lastSeenAtMs ?? row.sessionStartedAtMs;
    const silentMs = nowMs - referenceMs;
    const isSilent = silentMs >= silenceThresholdMs(row.intervalSeconds);

    if (!isSilent) {
      // Связь восстановилась — если был one-shot пуш, снимаем дедуп (§5 F6: "до восстановления связи").
      if (notifiedState.has(row.sessionId)) toClear.push(row.sessionId);
      continue;
    }

    const silentHours = Math.floor(silentMs / HOUR_MS);

    if (silentMs >= AUTO_END_SILENCE_MS) {
      // Автозавершение не зависит от alerts_muted (§5 F2) — мьют уважает только сам пуш (runner).
      toAutoEnd.push({ row, silentHours });
      continue;
    }

    if (row.alertsMuted) continue; // заглушено: не шлём push, в Map намеренно не кладём (§5 F6)
    if (!notifiedState.has(row.sessionId)) {
      toNotify.push({ row, silentHours });
    }
  }

  // Гигиена Map: сеанс завершился между сканами не через автозавершение (вручную
  // владельцем/по переводу партии в completed) — запись дедупа больше не нужна.
  for (const sessionId of notifiedState.keys()) {
    if (!seenSessionIds.has(sessionId)) toClear.push(sessionId);
  }

  return { toNotify, toAutoEnd, toClear };
}

// sessionId → nowMs последнего пуша «молчит» — живёт, пока жив процесс моста (см. заголовок файла).
const notifiedAt = new Map<string, number>();

/**
 * Периодический скан (main.ts, раз в 10 мин, §5 F6/F2): молчащие сеансы получают
 * one-shot пуш, брошенные дольше 7 суток — автозавершаются. Best-effort: ошибка
 * БД-выборки логируется и не бросается дальше (main.ts тоже оборачивает .catch —
 * двойная страховка); ошибка одного пуша/апдейта не блокирует обработку остальных строк.
 */
export async function runStreamSilenceScan(nowMs: number = Date.now()): Promise<void> {
  let rows: StreamSilenceCandidateRow[];
  try {
    rows = await getActiveStreamSilenceCandidates();
  } catch (err) {
    console.error("[stream-silence] сбой выборки:", err instanceof Error ? err.message : String(err));
    return;
  }

  const decision = decideSilenceActions(rows, notifiedAt, nowMs);

  for (const { row, silentHours } of decision.toNotify) {
    try {
      const sent = await sendPushToUser(
        row.userId,
        streamSilenceNotification(
          { deviceId: row.deviceId, deviceName: row.deviceName },
          silentHours,
          row.batchName,
          row.brewBatchId,
        ),
      );
      notifiedAt.set(row.sessionId, nowMs);
      console.log(`[stream-silence] ${row.deviceName}: молчит ${silentHours} ч → push x${sent}`);
    } catch (err) {
      console.error("[stream-silence] сбой пуша «молчит»:", err instanceof Error ? err.message : String(err));
    }
  }

  for (const { row, silentHours } of decision.toAutoEnd) {
    try {
      await endStreamSessionBySilence(row.sessionId);
      notifiedAt.delete(row.sessionId);
      console.log(`[stream-silence] ${row.deviceName}: сеанс автозавершён (молчит ${silentHours} ч)`);
    } catch (err) {
      console.error("[stream-silence] сбой автозавершения сеанса:", err instanceof Error ? err.message : String(err));
      continue; // не шлём пуш «завершён», если само завершение не удалось
    }

    if (row.alertsMuted) continue; // сам факт завершения от mute не зависит, пуш — зависит (§5 F2)
    try {
      const sent = await sendPushToUser(
        row.userId,
        streamSilenceAutoEndedNotification(
          { deviceId: row.deviceId, deviceName: row.deviceName },
          row.batchName,
          row.brewBatchId,
        ),
      );
      console.log(`[stream-silence] ${row.deviceName}: push автозавершения x${sent}`);
    } catch (err) {
      console.error("[stream-silence] сбой пуша автозавершения:", err instanceof Error ? err.message : String(err));
    }
  }

  for (const sessionId of decision.toClear) {
    notifiedAt.delete(sessionId);
  }
}
