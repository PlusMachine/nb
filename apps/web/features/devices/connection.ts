// =============================================================================
//  features/devices/connection.ts
//  Единый вывод «связь с устройством» для СТАТИЧНЫХ поверхностей (список плиток и
//  страница настроек). Пульт держит живой SSE и показывает более актуальный
//  статус (deriveConnStatus) — здесь мы про last-known состояние из БД.
//
//  Мотивация (UX-находка #14): раньше список читал свежесть телеметрии, а
//  настройки — сырой `status` + `lastSeenAt`, и они противоречили друг другу
//  («online» + «Последняя связь: —»). Причина «online без связи» — дефолт статуса
//  на момент привязки (claim), когда устройство ещё ни разу не выходило на связь.
//  Здесь один источник формулировок и одно правило: не называем «В сети» прибор,
//  от которого нет ни одного факта контакта.
//
//  Чистый модуль (без импорта БД) — переиспользуется и на сервере (настройки),
//  и на клиенте (плитка с общим тиком nowMs).
// =============================================================================
import type { DeviceStatus } from "./contracts";

export type DeviceConnectionTone = "online" | "offline" | "unknown";

export type DeviceConnectionSummary = {
  tone: DeviceConnectionTone;
  /** Человеческая формулировка статуса: «В сети» / «Не в сети» / «Ожидает подключения». */
  label: string;
  /** «5 мин назад» — по самому свежему факту контакта; null, если контактов не было. */
  lastContactLabel: string | null;
};

const STATUS_LABEL: Record<DeviceStatus, string> = {
  online: "В сети",
  offline: "Не в сети",
  unknown: "Статус неизвестен"
};

const STATUS_TONE: Record<DeviceStatus, DeviceConnectionTone> = {
  online: "online",
  offline: "offline",
  unknown: "unknown"
};

// Единый формат «сколько назад» для всех статичных поверхностей (список+настройки).
export function fmtDeviceContactAgo(ageMs: number): string {
  const s = Math.max(0, Math.floor(ageMs / 1000));
  if (s < 5) return "только что";
  if (s < 60) return `${s} с назад`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.floor(h / 24)} дн назад`;
}

export function summarizeDeviceConnection(
  input: {
    status: DeviceStatus;
    /** Последний heartbeat из БД (мс epoch) или null. */
    lastSeenAtMs: number | null;
    /** Время самого свежего сохранённого кадра телеметрии (мс epoch) или null. */
    lastTelemetryAtMs?: number | null;
  },
  nowMs: number
): DeviceConnectionSummary {
  const contacts = [input.lastSeenAtMs, input.lastTelemetryAtMs ?? null].filter(
    (value): value is number => value != null && Number.isFinite(value)
  );
  const lastContactMs = contacts.length > 0 ? Math.max(...contacts) : null;
  const lastContactLabel = lastContactMs != null ? fmtDeviceContactAgo(Math.max(0, nowMs - lastContactMs)) : null;

  // «online» без единого факта контакта — это claim-дефолт, а не реальная связь:
  // не выдаём его за «В сети».
  if (input.status === "online" && lastContactMs == null) {
    return { tone: "unknown", label: "Ожидает подключения", lastContactLabel: null };
  }

  return { tone: STATUS_TONE[input.status], label: STATUS_LABEL[input.status], lastContactLabel };
}
