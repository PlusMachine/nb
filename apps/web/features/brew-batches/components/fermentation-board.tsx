"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, FlaskConical } from "lucide-react";

import { buildFinishBrewConfirm, groupsForAct, resolveBrewDayCursor } from "@/features/brew-batches/brew-day";
import { type BrewDayProgress, type BrewDayStageGroup } from "@/features/brew-batches/contracts";
import { useWakeLock } from "@/features/brew-controller/use-wake-lock";
import { BrewStepList } from "./brew-step-list";
import { BrewTransitionButton } from "./brew-transition-button";
import { useBrewDayProgress } from "./use-brew-day-progress";

export type FermentationNudge = { tone: "action" | "warn" | "info"; text: string };

// Первичное брожение уже отражено героем «день N из M» — отдельный чекбокс-дубль
// «Поставить на брожение» в этом акте убираем (см. спеку §9). Экспортируется, чтобы
// история завершённой варки прятала тот же нечекаемый шаг (иначе «Брожение 0/1»).
export const HERO_STEP_IDS = new Set(["ferment:primary"]);

function NudgeLine({ nudge }: { nudge: FermentationNudge | null }) {
  if (!nudge || !nudge.text) {
    return null;
  }
  if (nudge.tone === "warn") {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-warning-subtle px-3 py-2 text-sm font-medium text-warning-subtle-foreground">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        {nudge.text}
      </p>
    );
  }
  if (nudge.tone === "action") {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-success-subtle px-3 py-2 text-sm font-medium text-success-subtle-foreground">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        {nudge.text}
      </p>
    );
  }
  return <p className="text-sm text-muted-foreground">{nudge.text}</p>;
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
  fermentDayN,
  plannedDays,
  targetTempLabel,
  nudge
}: {
  brewBatchId: string;
  groups: BrewDayStageGroup[];
  initialProgress: BrewDayProgress;
  dayLabel: string | null;
  /** День брожения и плановая длительность — числами, для подтверждения завершения. */
  fermentDayN: number | null;
  /** null — план без длительности (старые партии): текст деградирует до «День N». */
  plannedDays: number | null;
  targetTempLabel: string | null;
  nudge: FermentationNudge | null;
}) {
  const controller = useBrewDayProgress(brewBatchId, initialProgress);

  const fermentGroups = groupsForAct(groups, "fermentation")
    .map((group) => ({ ...group, steps: group.steps.filter((step) => !HERO_STEP_IDS.has(step.id)) }))
    .filter((group) => group.steps.length > 0);

  const cursor = resolveBrewDayCursor(fermentGroups, controller.progress, "fermentation");
  const undone = cursor.total - cursor.doneCount;

  // Экран не гаснет, только пока в списке шагов реально тикает активный таймер
  // (розлив/промежуточные шаги брожения у котла/ферментера), не постоянно.
  const hasRunningTimer = fermentGroups.some((group) =>
    group.steps.some((step) => (
      step.kind === "timer"
      && step.durationSeconds != null
      && controller.progress.steps[step.id]?.timerStartedAt != null
    ))
  );
  useWakeLock(hasRunningTimer);
  // Подтверждение спрашиваем всегда (Р11): типовой рецепт даёт единственный шаг
  // брожения, и тот — герой, поэтому undone здесь обычно 0, а завершение варки на
  // 1-м дне из 10 срабатывало одним кликом. Текст — в completion.ts (доменный слой).
  const finishConfirm = buildFinishBrewConfirm({ fermentDayN, plannedDays, undoneSteps: undone });
  const finishEarly = finishConfirm.tone === "danger";

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">Брожение</h2>
        {cursor.total > 0 ? <span className="text-xs tabular-nums text-muted-foreground">{cursor.doneCount} / {cursor.total}</span> : null}
      </div>

      <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4 dark:border-violet-500/30 dark:bg-violet-500/15">
        <div className="flex items-center gap-2 text-violet-900 dark:text-violet-300">
          <FlaskConical className="h-5 w-5" aria-hidden />
          <p className="text-lg font-semibold">{dayLabel ?? "Идёт брожение"}</p>
        </div>
        {targetTempLabel ? <p className="mt-0.5 text-sm text-violet-700 dark:text-violet-300">Целевая температура {targetTempLabel}</p> : null}
      </div>

      <NudgeLine nudge={nudge} />

      {controller.error ? <p role="alert" className="text-xs text-destructive">{controller.error}</p> : null}

      {fermentGroups.length > 0 ? (
        <BrewStepList groups={fermentGroups} controller={controller} currentStage={cursor.current?.stage ?? null} />
      ) : null}

      <div className="border-t border-border pt-3">
        {/* Завершение раньше плана — не основной путь: кнопка остаётся outline,
            даже если все шаги отмечены (иначе на 1-м дне из 10 она зовёт нажать). */}
        <BrewTransitionButton
          brewBatchId={brewBatchId}
          to="completed"
          label="Завершить варку"
          variant={!finishEarly && (cursor.total === 0 || cursor.actComplete) ? "primary" : "outline"}
          size="md"
          confirm={finishConfirm}
          appendQueryOnSuccess="just-completed=1"
        />
      </div>
    </section>
  );
}
