import React from "react";
import { ChevronRight, Play } from "lucide-react";

import { type BrewDayPlanSummary, type BrewDayStageGroup, type BrewPlanSnapshot } from "@/features/brew-batches/contracts";
import { manualBrewPhases } from "../manual-brew";
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
  plannedForIso,
  equipmentWarnings = [],
  groups,
  snapshot,
  showDateEditor = true
}: {
  brewBatchId: string;
  planSummary: BrewDayPlanSummary;
  ogTargetLabel: string | null;
  plannedForIso: string | null;
  equipmentWarnings?: string[];
  groups?: BrewDayStageGroup[];
  snapshot?: BrewPlanSnapshot;
  showDateEditor?: boolean;
}) {
  const timerTotal = fmtTimerTotal(planSummary.totalTimerSeconds);
  const hasPlan = planSummary.stages.length > 0;
  const phases = groups ? manualBrewPhases(groups) : null;
  const mashWater = typeof snapshot?.waterPlanMeta?.mashWaterVolumeL === "number" ? snapshot.waterPlanMeta.mashWaterVolumeL : null;
  const spargeWater = typeof snapshot?.waterPlanMeta?.spargeWaterVolumeL === "number" ? snapshot.waterPlanMeta.spargeWaterVolumeL : null;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-xl font-semibold text-foreground">Начало варки</h2>
      {snapshot?.grainBillTotalKg != null || mashWater != null ? <dl className="grid grid-cols-2 gap-4">
        {snapshot?.grainBillTotalKg != null ? <div><dt className="text-xs text-muted-foreground">Засыпь</dt><dd className="mt-1 text-2xl font-semibold">{snapshot.grainBillTotalKg.toLocaleString("ru-RU")} кг</dd></div> : null}
        {mashWater != null ? <div><dt className="text-xs text-muted-foreground">Заторная вода</dt><dd className="mt-1 text-2xl font-semibold">{mashWater.toLocaleString("ru-RU")} л</dd></div> : null}
      </dl> : null}
      {spargeWater != null && spargeWater > 0 ? <p className="text-sm text-muted-foreground">Ещё {spargeWater.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} л воды понадобится для промывки.</p> : null}

      {equipmentWarnings.length ? <div role="alert" className="space-y-1 rounded-lg bg-warning-subtle p-3 text-sm text-warning-subtle-foreground">{equipmentWarnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}
      {snapshot?.otherAdditions?.length ? <p className="rounded-lg bg-warning-subtle p-3 text-sm text-warning-subtle-foreground">Для некоторых внесений хмеля в рецепте не указан этап. Проверьте их в плане перед началом варки.</p> : null}

      {hasPlan ? (
        <>
          {phases ? <details open className="group"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium"><ChevronRight className="h-4 w-4 transition group-open:rotate-90" aria-hidden />План варки</summary><ol className="ml-6 space-y-2 text-sm">{phases.map(phase => <li key={phase.id}>{phase.label}{phase.unordered ? <ul className="mt-1 space-y-1 text-xs text-muted-foreground">{phase.steps.map(step => <li key={step.id}>{step.title}{step.amountLabel ? ` · ${step.amountLabel}` : ""}{step.instructions ? ` — ${step.instructions}` : ""}</li>)}</ul> : null}</li>)}</ol></details> : <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
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
          </ol>}
          <p className="text-xs text-muted-foreground">
            Шагов: {planSummary.totalSteps}
            {timerTotal ? ` · ${timerTotal}` : ""}
            {ogTargetLabel ? ` · НП по рецепту ${ogTargetLabel}` : ""}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          В рецепте нет этапов затирания и кипячения. Можно начать варку, записывать замеры и заметки.
        </p>
      )}

      {showDateEditor ? <details><summary className="min-h-11 cursor-pointer py-3 text-sm text-muted-foreground">{plannedForIso ? "Изменить дату" : "Запланировать дату"}</summary><BrewPlannedDate brewBatchId={brewBatchId} plannedForIso={plannedForIso} /></details> : null}

      <BrewTransitionButton
        brewBatchId={brewBatchId}
        to="brewing"
        label="Начать варку"
        variant="primary"
        size="md"
        icon={<Play className="h-4 w-4" aria-hidden />}
      />
    </section>
  );
}
