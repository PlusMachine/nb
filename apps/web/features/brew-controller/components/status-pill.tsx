"use client";

// =============================================================================
//  features/brew-controller/components/status-pill.tsx
//  Единый индикатор статуса связи с устройством (пульт L2 «зона B» + варка партии
//  «зона A»). ОДИН словарь на весь UI — выводится из состояния соединения +
//  свежести телеметрии (+ есть ли вообще устройство). Заменяет разрозненные
//  connBadge-строки, что раньше жили инлайном в LiveDashboard (см. редизайн L2 §6).
// =============================================================================

/** Состояние SSE-соединения дашборда (owner подписки — LiveDashboard). */
export type ConnState = "connecting" | "online" | "offline" | "error";

export type ConnStatusKey = "no-device" | "stale" | "online" | "offline" | "error" | "connecting";

type StatusInfo = { key: ConnStatusKey; label: string; cls: string };

/**
 * Единый словарь статуса связи. Приоритет: нет устройства → устарело (кадр был,
 * но давно) → в эфире → офлайн → ошибка → подключение. Свежесть (`isStale`)
 * считает владелец SSE-подписки и передаёт сюда — модуль без побочных эффектов
 * (чистый, client-safe, тестируемый).
 */
export function deriveConnStatus({
  hasDevice,
  conn,
  isStale,
}: {
  hasDevice: boolean;
  conn: ConnState;
  isStale: boolean;
}): StatusInfo {
  if (!hasDevice) return { key: "no-device", label: "Нет устройства", cls: "bg-zinc-100 text-zinc-600" };
  if (isStale) return { key: "stale", label: "Устарело", cls: "bg-amber-100 text-amber-800" };
  if (conn === "online") return { key: "online", label: "В эфире", cls: "bg-emerald-100 text-emerald-800" };
  if (conn === "offline") return { key: "offline", label: "Офлайн", cls: "bg-amber-100 text-amber-800" };
  if (conn === "error") return { key: "error", label: "Ошибка связи", cls: "bg-red-100 text-red-800" };
  return { key: "connecting", label: "Подключение…", cls: "bg-zinc-100 text-zinc-600" };
}

/** Пилюля статуса: точка + слово из единого словаря. */
export function StatusPill({
  hasDevice,
  conn,
  isStale,
}: {
  hasDevice: boolean;
  conn: ConnState;
  isStale: boolean;
}) {
  const s = deriveConnStatus({ hasDevice, conn, isStale });
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${s.cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}
