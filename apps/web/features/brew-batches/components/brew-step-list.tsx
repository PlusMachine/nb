"use client";

import React from "react";
import { Check, ChevronRight, Loader2, Play, RotateCcw, Timer } from "lucide-react";

import {
  type BrewDayStage,
  type BrewDayStageGroup,
  type BrewDayStep
} from "@/features/brew-batches/contracts";
import { fmtClock, remainingSeconds } from "./brew-day-timer";
import type { BrewDayProgressController } from "./use-brew-day-progress";

// Секунды до момента засыпи кипячения = сколько осталось кипятить − «за N до конца».
const secondsUntilBoilAddition = (step: BrewDayStep, boilRemaining: number | null): number | null => {
  if (step.boilSecondsBeforeEnd == null || boilRemaining == null) {
    return null;
  }
  return boilRemaining - step.boilSecondsBeforeEnd;
};

function BrewStepRow({
  step,
  controller,
  boilRemaining,
  readOnly
}: {
  step: BrewDayStep;
  controller: BrewDayProgressController;
  boilRemaining: number | null;
  readOnly: boolean;
}) {
  const { progress, pending, now, patchStep } = controller;
  const state = progress.steps[step.id] ?? { done: false, timerStartedAt: null };
  const busy = Boolean(pending[step.id]);

  const isTimer = step.kind === "timer" && step.durationSeconds != null;
  const remaining = isTimer && now != null ? remainingSeconds(step.durationSeconds, state.timerStartedAt, now) : null;
  const timerRunning = isTimer && state.timerStartedAt != null;
  const timerDone = remaining != null && remaining <= 0;

  // Живой обратный отсчёт до засыпи (пока идёт таймер кипячения).
  const untilAdd = !state.done && step.kind === "addition" ? secondsUntilBoilAddition(step, boilRemaining) : null;

  return (
    <li
      className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 transition ${
        state.done ? "border-success/30 bg-success-subtle/50" : "border-border bg-card"
      }`}
    >
      {/* Визуальный чекбокс остаётся 24px (не превращается в гигантский квадрат), но
          тач-зона через невидимый ::before растянута до ~44px — у котла тапают мокрым
          пальцем, промах в основное действие шага недопустим. */}
      <button
        type="button"
        onClick={() => patchStep(step.id, { done: !state.done })}
        disabled={busy || readOnly}
        aria-pressed={state.done}
        aria-label={state.done ? "Снять отметку" : "Отметить шаг выполненным"}
        className={`relative mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition disabled:opacity-50 before:absolute before:-inset-2.5 before:content-[''] ${
          state.done
            ? "border-success bg-success text-white"
            : "border-border bg-card text-transparent hover:border-muted-foreground"
        }`}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${state.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
          {step.title}
        </p>
        {step.detail ? <p className="text-xs text-muted-foreground">{step.detail}</p> : null}
        {untilAdd != null ? (
          <p className={`mt-0.5 text-xs font-semibold tabular-nums ${untilAdd <= 0 ? "text-warning-subtle-foreground" : "text-muted-foreground"}`}>
            {untilAdd <= 0 ? "пора вносить" : `через ${fmtClock(untilAdd)}`}
          </p>
        ) : null}
      </div>

      {isTimer ? (
        <div className="flex shrink-0 items-center gap-2">
          {timerRunning ? (
            <>
              <span
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                  timerDone ? "bg-success-subtle text-success-subtle-foreground" : "bg-warning-subtle text-warning-subtle-foreground"
                }`}
              >
                <Timer className="h-3.5 w-3.5" aria-hidden />
                {now == null ? "—" : timerDone ? "готово" : fmtClock(remaining ?? 0)}
              </span>
              {!readOnly ? (
                <button
                  type="button"
                  onClick={() => patchStep(step.id, { timerStartedAt: null })}
                  disabled={busy}
                  aria-label="Сбросить таймер"
                  className="relative inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-50 before:absolute before:-inset-2 before:content-['']"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                </button>
              ) : null}
            </>
          ) : !readOnly ? (
            <button
              type="button"
              onClick={() => patchStep(step.id, { timerStartedAt: new Date().toISOString() })}
              disabled={busy}
              aria-label="Запустить таймер"
              className="relative inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium text-foreground transition hover:bg-accent disabled:opacity-50 before:absolute before:-inset-2 before:content-['']"
            >
              <Play className="h-3.5 w-3.5" aria-hidden />
              {step.durationSeconds != null ? fmtClock(step.durationSeconds) : "Таймер"}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground tabular-nums">{step.durationSeconds != null ? fmtClock(step.durationSeconds) : null}</span>
          )}
        </div>
      ) : null}
    </li>
  );
}

function StepGroupBody({
  group,
  controller,
  boilRemaining,
  readOnly
}: {
  group: BrewDayStageGroup;
  controller: BrewDayProgressController;
  boilRemaining: number | null;
  readOnly: boolean;
}) {
  return (
    <ul className="space-y-1.5">
      {group.steps.map((step) => (
        <BrewStepRow key={step.id} step={step} controller={controller} boilRemaining={boilRemaining} readOnly={readOnly} />
      ))}
    </ul>
  );
}

/**
 * Список шагов гида, сгруппированный по этапам. Текущий этап раскрыт; пройденные и
 * будущие этапы свёрнуты в `<details>` (нативная доступная свёртка, без JS-стейта).
 * boilRemaining прокидывается для живого отсчёта засыпей кипячения.
 */
export function BrewStepList({
  groups,
  controller,
  currentStage = null,
  readOnly = false
}: {
  groups: BrewDayStageGroup[];
  controller: BrewDayProgressController;
  currentStage?: BrewDayStage | null;
  readOnly?: boolean;
}) {
  const { progress, now } = controller;

  // Остаток таймера кипячения — источник живого отсчёта засыпей (ищем boil:timer).
  const boilTimer = groups.flatMap((group) => group.steps).find((step) => step.id === "boil:timer");
  const boilTimerState = boilTimer ? progress.steps[boilTimer.id] : undefined;
  const boilRemaining = boilTimer && now != null
    ? remainingSeconds(boilTimer.durationSeconds, boilTimerState?.timerStartedAt ?? null, now)
    : null;

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const doneCount = group.steps.filter((step) => progress.steps[step.id]?.done).length;
        const allDone = doneCount === group.steps.length;
        const isCurrent = currentStage != null && group.stage === currentStage;
        // Раскрыт: текущий этап; в read-only — всё свёрнуто; иначе — первый незавершённый.
        const expanded = !readOnly && (isCurrent || (currentStage == null && !allDone));

        if (expanded) {
          return (
            <section key={group.stage} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</h3>
                <span className="text-[11px] tabular-nums text-muted-foreground">{doneCount} / {group.steps.length}</span>
              </div>
              <StepGroupBody group={group} controller={controller} boilRemaining={boilRemaining} readOnly={readOnly} />
            </section>
          );
        }

        return (
          <details key={group.stage} className="group rounded-xl border border-border bg-muted/40">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-open:rotate-90" aria-hidden />
              <span className="font-medium">{group.label}</span>
              {allDone ? (
                <span className="inline-flex items-center gap-1 text-xs text-success">
                  <Check className="h-3.5 w-3.5" aria-hidden /> готово
                </span>
              ) : (
                <span className="text-xs text-muted-foreground tabular-nums">{doneCount} / {group.steps.length}</span>
              )}
            </summary>
            <div className="px-3 pb-3">
              <StepGroupBody group={group} controller={controller} boilRemaining={boilRemaining} readOnly={readOnly} />
            </div>
          </details>
        );
      })}
    </div>
  );
}
