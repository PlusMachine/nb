import type { Telemetry } from "@nb/brewforge-protocol";

/** Имя, навеска и индекс только одного текущего события. Будущий хмель сюда не подставляем. */
export function pendingHop(telemetry: Telemetry | null) {
  if (!telemetry || !["BOILING", "HOP_STAND"].includes(telemetry.stageName)) return null;
  const hop = telemetry.pendingHop;
  return hop && hop.index >= 0 && hop.count > 0 ? hop : null;
}
