import React from "react";
import { ChevronRight, Play } from "lucide-react";

import { type BrewDayPlanSummary } from "@/features/brew-batches/contracts";
import { BrewPlannedDate } from "./brew-planned-date";
import { BrewTransitionButton } from "./brew-transition-button";

// «≈ N ч M мин» из секунд таймеров — грубая оценка активного времени варки.
const fmtTimerTotal = (seconds: number): string | null => {
  const minutes = Math.round(seconds / 60);
  if (minutes <= 0) {
    return null;
  }
  if (minutes < 60) {
    return `≈ ${minutes} мин`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `≈ ${hours} ч ${rest} мин` : `≈ ${hours} ч`;
};

/**
 * Акт «Подготовка» (статус planned): превью плана варочного дня (этапы, число
 * шагов, активное время, цель OG) и единственная главная кнопка страницы —
 * «Начать варочный день». Списание склада — соседней секцией (чек подготовки).
 */
export function BrewPrepCard({
  brewBatchId,
  planSummary,
  ogTargetLabel,
  plannedForIso
}: {
  brewBatchId: string;
  planSummary: BrewDayPlanSummary;
  ogTargetLabel: string | null;
  plannedForIso: string | null;
}) {
  const timerTotal = fmtTimerTotal(planSummary.totalTimerSeconds);
  const hasPlan = planSummary.stages.length > 0;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">План варочного дня</h2>

      {hasPlan ? (
        <>
          <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
            {planSummary.stages.map((stage, index) => (
              <li key={stage.stage} className="flex items-center gap-1">
                <span className="rounded-lg bg-muted px-2.5 py-1 text-foreground ring-1 ring-border">
                  {stage.label}
                  <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{stage.stepCount}</span>
                </span>
                {index < planSummary.stages.length - 1 ? (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : null}
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            {planSummary.totalSteps} шагов
            {timerTotal ? ` · ${timerTotal} активного времени` : ""}
            {ogTargetLabel ? ` · цель OG ${ogTargetLabel}` : ""}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          В рецепте нет шагов затора/кипячения — гид варочного дня будет пустым. Замеры и заметки доступны после старта.
        </p>
      )}

      <BrewPlannedDate brewBatchId={brewBatchId} plannedForIso={plannedForIso} />

      <BrewTransitionButton
        brewBatchId={brewBatchId}
        to="brewing"
        label="Начать варочный день"
        variant="primary"
        size="md"
        icon={<Play className="h-4 w-4" aria-hidden />}
      />
    </section>
  );
}
