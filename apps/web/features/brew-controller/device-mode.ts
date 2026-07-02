// =============================================================================
//  features/brew-controller/device-mode.ts
//  Режим пульта = «зеркало платы» (редизайн L2 §1.2/§6): UI отражает состояние
//  устройства (простой / авто-варка / ручной / авария), а НЕ абстрактный 3-way-
//  переключатель, который рисовать не надо. Чистый модуль без побочных эффектов —
//  client-safe, тестируемый.
// =============================================================================
import type { Stage, Telemetry } from "@nb/brewforge-protocol";

/**
 *  Состояние устройства, которое отражает пульт:
 *   - "offline" — нет свежей телеметрии, состояние платы неизвестно;
 *   - "idle"    — простой/готово: пивоварня свободна (точка входа в варку, §7);
 *   - "auto"    — идёт авто-варка по флоу стадий (засыпь→…→охлаждение), §1.2;
 *   - "manual"  — ручной режим (override уставки/мощности/насоса);
 *   - "fault"   — плата остановлена по аварии (стадия FAULT).
 */
export type DeviceMode = "offline" | "idle" | "auto" | "manual" | "fault";

// Стадии простоя: пивоварня свободна. DONE (варка завершена) трактуем как простой
// — точка входа для новой варки; сам факт «готово» показывает профиль-полоса.
const IDLE_STAGES: Stage[] = ["IDLE", "DONE"];

/**
 * Выводит режим пульта из снимка телеметрии. Приоритет: нет живого кадра →
 * offline; стадия FAULT → fault; MANUAL → manual; IDLE/DONE → idle; иначе идёт
 * авто-варка → auto. Свежесть (`isLive`) считает владелец SSE-подписки —
 * при устаревании/офлайне режим неизвестен (UI не притворяется, что знает плату).
 *
 * Аварии ВНУТРИ варки (faultMask при auto/manual) — это баннер (AlarmsPanel), а
 * НЕ режим: mode остаётся auto/manual, поэтому здесь смотрим только на стадию.
 */
export function deriveDeviceMode(
  telemetry: Pick<Telemetry, "stageName"> | null,
  isLive: boolean,
): DeviceMode {
  if (!isLive || telemetry === null) return "offline";
  if (telemetry.stageName === "FAULT") return "fault";
  if (telemetry.stageName === "MANUAL") return "manual";
  if (IDLE_STAGES.includes(telemetry.stageName)) return "idle";
  return "auto";
}
