// Чистые хелперы таймеров варочного дня (общие для героя и списка шагов).

/** M:SS из секунд (минуты не ограничены 60 — кипячение может быть >60 мин). */
export const fmtClock = (totalSeconds: number): string => {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

/**
 * Оставшиеся секунды таймера: длительность − (сейчас − старт). null — не запущен
 * или нет длительности. nowMs передаётся снаружи (детерминизм, единый тик).
 */
export const remainingSeconds = (
  durationSeconds: number | null,
  startedAtIso: string | null,
  nowMs: number
): number | null => {
  if (!startedAtIso || durationSeconds == null) {
    return null;
  }
  const startedMs = new Date(startedAtIso).getTime();
  if (!Number.isFinite(startedMs)) {
    return null;
  }
  return durationSeconds - (nowMs - startedMs) / 1000;
};
