import { formatGravity } from "@/features/system/gravity-units";
import type { PreferredGravityUnit } from "@nb/auth";

// =============================================================================
//  features/device-streams/reading-summary.ts
//  Чистое форматирование «последнего показания» стрим-устройства для живой зоны
//  F1 («✅ Данные пошли: 1.048 · 19.3 °C · батарея 4.1 В») и краткой строки на
//  странице/плитке. Плотность — в предпочитаемой единице пользователя (SG/°P/°Bx,
//  features/system/gravity-units), не всегда «сырой SG».
// =============================================================================

export type ReadingSummaryInput = {
  gravitySg: number | null;
  tempC: number | null;
  batteryV: number | null;
  batteryPct: number | null;
};

/** «1.048 · 19.3 °C · батарея 4.1 В» — части через « · », отсутствующие поля пропускаются. */
export function formatReadingSummary(reading: ReadingSummaryInput, unit: PreferredGravityUnit): string {
  const parts: string[] = [];
  if (reading.gravitySg !== null) {
    parts.push(formatGravity(reading.gravitySg, unit));
  }
  if (reading.tempC !== null) {
    parts.push(`${reading.tempC.toFixed(1)} °C`);
  }
  if (reading.batteryV !== null) {
    parts.push(`батарея ${reading.batteryV.toFixed(1)} В`);
  } else if (reading.batteryPct !== null) {
    parts.push(`батарея ${Math.round(reading.batteryPct)}%`);
  }
  return parts.join(" · ");
}
