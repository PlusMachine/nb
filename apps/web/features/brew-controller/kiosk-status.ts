// =============================================================================
//  features/brew-controller/kiosk-status.ts
//  Чистые функции для киоска (веб-HMI §9/§9.1/§12.1): текст крупного
//  офлайн-баннера («данные устарели» / «прибор офлайн») и текст одноразовой
//  подсказки про Wake Lock. Вынесены из kiosk-shell.tsx отдельным модулем без
//  побочных эффектов — vitest-среда features/** без DOM (см. vitest.config.ts),
//  поэтому тестируемое живёт здесь, а не в компоненте.
// =============================================================================
import type { ConnState } from "./components/status-pill";

export type KioskOfflineBanner = {
  tone: "amber" | "red";
  title: string;
  /** «последний кадр 5 мин назад» — или "", если момент кадра неизвестен. */
  detail: string;
};

function fmtAgo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 5) return "только что";
  if (s < 60) return `${s} с назад`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.floor(h / 24)} дн назад`;
}

/**
 * Офлайн-честность (§9/§12.1): экран у плиты не должен молча врать, поэтому
 * киоск явно отличает «данные устарели» от «прибор офлайн». Приоритет: обрыв
 * связи (`conn === "offline"`) → красный «Прибор офлайн» (важнее — соединения
 * нет вовсе); кадр есть, но устарел (`isStale`) → амбер «Данные устарели»;
 * иначе баннера нет (свежая телеметрия — сообщать нечего). Совпадает по смыслу
 * с `noFreshTelemetry` дока управления (control-dock.tsx).
 */
export function kioskOfflineBanner(input: {
  conn: ConnState;
  isStale: boolean;
  lastFrameAtMs: number | null;
  nowMs: number;
}): KioskOfflineBanner | null {
  const { conn, isStale, lastFrameAtMs, nowMs } = input;
  const detail = lastFrameAtMs === null ? "" : `последний кадр ${fmtAgo(nowMs - lastFrameAtMs)}`;

  if (conn === "offline") {
    return { tone: "red", title: "Прибор офлайн", detail };
  }
  if (isStale) {
    return { tone: "amber", title: "Данные устарели", detail };
  }
  return null;
}

/** Одноразовая подсказка про Wake Lock при первом входе в киоск (§9, §12.4). */
export function wakeLockHintMessage(engaged: boolean): string {
  return engaged
    ? "Экран не будет гаснуть, пока открыт киоск"
    : "Включите «не гасить экран» в настройках устройства";
}
