import { calculateAbv, calculateApparentAttenuation } from "@nb/brewing-core";

import type { BrewMeasurementDto, BrewMeasurementSummary } from "./contracts";

/**
 * Чистая сводка журнала замеров. OG = самый ранний замер; FG = замер, явно
 * помеченный как финальный (isFinal) — а не «самый поздний», иначе любой
 * промежуточный замер брожения перехватывал бы FG. Если финальный не отмечен,
 * FG/ABV/сбраживание = null. ABV и кажущееся сбраживание считаются из OG/FG через
 * brewing-core; при бессмысленных данных (fg ≥ og, og ≤ 1) — null. Без БД, тестируема.
 */
export const summarizeBrewMeasurements = (
  measurements: BrewMeasurementDto[],
  targets: { og: number | null; fg: number | null; abv: number | null } | null
): BrewMeasurementSummary => {
  const sorted = [...measurements].sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime());
  const og = sorted.length > 0 ? sorted[0]!.gravitySg : null;
  const fg = measurements.find((measurement) => measurement.isFinal)?.gravitySg ?? null;

  const hasPair = og != null && fg != null && og > fg && og > 1;
  return {
    og,
    fg,
    abv: hasPair ? calculateAbv(og, fg) : null,
    apparentAttenuation: hasPair ? calculateApparentAttenuation(og, fg) : null,
    target: targets
  };
};
