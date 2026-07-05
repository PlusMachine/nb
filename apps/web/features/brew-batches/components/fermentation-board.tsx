"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, FlaskConical } from "lucide-react";

import { groupsForAct, resolveBrewDayCursor } from "@/features/brew-batches/brew-day";
import { type BrewDayProgress, type BrewDayStageGroup } from "@/features/brew-batches/contracts";
import { BrewStepList } from "./brew-step-list";
import { BrewTransitionButton } from "./brew-transition-button";
import { useBrewDayProgress } from "./use-brew-day-progress";

export type FermentationNudge = { tone: "action" | "warn" | "info"; text: string };

// Первичное брожение уже отражено героем «день N из M» — отдельный чекбокс-дубль
// «Поставить на брожение» в этом акте убираем (см. спеку §9). Экспортируется, чтобы
// история завершённой варки прятала тот же нечекаемый шаг (иначе «Брожение 0/1»).
export const HERO_STEP_IDS = new Set(["ferment:primary"]);

const declOfSteps = (n: number): string => (n === 1 ? "шаг" : n >= 2 && n <= 4 ? "шага" : "шагов");

function NudgeLine({ nudge }: { nudge: FermentationNudge | null }) {
  if (!nudge || !nudge.text) {
    return null;
  }
  if (nudge.tone === "warn") {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        {nudge.text}
      </p>
    );
  }
  if (nudge.tone === "action") {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        {nudge.text}
      </p>
    );
  }
  return <p className="text-sm text-zinc-500">{nudge.text}</p>;
}

/**
 * Акт «Брожение» (статус fermenting): герой «день N из M · цель t°», подсказка
 * следующего действия (общий словарь с дашбордом), шаги брожения/розлива и переход
 * к завершению варки. Журнал замеров (FG) — соседней секцией, главный блок акта.
 */
export function FermentationBoard({
  brewBatchId,
  groups,
  initialProgress,
  dayLabel,
  targetTempLabel,
  nudge
}: {
  brewBatchId: string;
  groups: BrewDayStageGroup[];
  initialProgress: BrewDayProgress;
  dayLabel: string | null;
  targetTempLabel: string | null;
  nudge: FermentationNudge | null;
}) {
  const controller = useBrewDayProgress(brewBatchId, initialProgress);

  const fermentGroups = groupsForAct(groups, "fermentation")
    .map((group) => ({ ...group, steps: group.steps.filter((step) => !HERO_STEP_IDS.has(step.id)) }))
    .filter((group) => group.steps.length > 0);

  const cursor = resolveBrewDayCursor(fermentGroups, controller.progress, "fermentation");
  const undone = cursor.total - cursor.doneCount;
  const finishConfirm = undone > 0
    ? {
        title: "Завершить варку?",
        description: `Ещё ${undone} ${declOfSteps(undone)} брожения/розлива не отмечено. Всё равно завершить и подвести итог?`
      }
    : null;

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-zinc-900">Брожение</h2>
        {cursor.total > 0 ? <span className="text-xs tabular-nums text-zinc-500">{cursor.doneCount} / {cursor.total}</span> : null}
      </div>

      <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
        <div className="flex items-center gap-2 text-violet-900">
          <FlaskConical className="h-5 w-5" aria-hidden />
          <p className="text-lg font-semibold">{dayLabel ?? "Идёт брожение"}</p>
        </div>
        {targetTempLabel ? <p className="mt-0.5 text-sm text-violet-700">Целевая температура {targetTempLabel}</p> : null}
      </div>

      <NudgeLine nudge={nudge} />

      {controller.error ? <p role="alert" className="text-xs text-rose-600">{controller.error}</p> : null}

      {fermentGroups.length > 0 ? (
        <BrewStepList groups={fermentGroups} controller={controller} currentStage={cursor.current?.stage ?? null} />
      ) : null}

      <div className="border-t border-zinc-100 pt-3">
        <BrewTransitionButton
          brewBatchId={brewBatchId}
          to="completed"
          label="Завершить варку"
          variant={cursor.total === 0 || cursor.actComplete ? "primary" : "outline"}
          size="md"
          confirm={finishConfirm}
        />
      </div>
    </section>
  );
}
