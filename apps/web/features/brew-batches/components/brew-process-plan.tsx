"use client";

import React, { useEffect, useState } from "react";
import { ArrowRight, Check, ChevronDown, Circle, Timer } from "lucide-react";
import type { BrewDayProgress, BrewDayStep } from "../contracts";
import type { ManualBrewPhase } from "../manual-brew";
import { fmtClock, stepRemainingSeconds } from "./brew-day-timer";

export function BrewProcessPlan({ phases, progress, current, phaseIndex, now, storageKey, onPreview }: {
  phases: ManualBrewPhase[]; progress: BrewDayProgress; current: BrewDayStep | null;
  phaseIndex: number; now: number | null; storageKey: string;
  onPreview: (step: BrewDayStep) => void;
}) {
  const [open, setOpen] = useState(false);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try { setOpen(localStorage.getItem(storageKey) === "open"); } catch { /* Plan disclosure still works without storage. */ }
    setRestored(true);
  }, [storageKey]);
  const changeOpen = (value: boolean) => {
    setOpen(value);
    if (restored) try { localStorage.setItem(storageKey, value ? "open" : "closed"); } catch { /* Optional display preference. */ }
  };
  return <details open={open} onToggle={event => changeOpen(event.currentTarget.open)} className="group/plan" data-testid="brew-process-plan">
    <summary aria-label="План варки" className="list-none cursor-pointer rounded-lg py-2 [&::-webkit-details-marker]:hidden">
      <span className="flex items-center justify-between gap-3 text-sm">
        <span>{phaseIndex < 0 ? "Все шаги выполнены" : `Этап ${phaseIndex + 1} из ${phases.length}`}</span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">План<ChevronDown className="h-4 w-4 transition group-open/plan:rotate-180" aria-hidden /></span>
      </span>
      <span className="mt-2 flex gap-1.5" aria-hidden>
        {phases.map((phase, index) => {
          const done = phase.steps.filter(step => progress.steps[step.id]?.done).length;
          return <span key={phase.id} className={`h-1 flex-1 overflow-hidden rounded-full ${index === phaseIndex ? "bg-success/25" : "bg-border"}`}>
            <span className="block h-full bg-success" style={{ width: `${100 * done / phase.steps.length}%` }} />
          </span>;
        })}
      </span>
    </summary>
    <ol className="mt-2 space-y-1">
      {phases.map((phase, index) => {
        const done = phase.steps.filter(step => progress.steps[step.id]?.done).length;
        const finished = done === phase.steps.length;
        const active = index === phaseIndex;
        const Icon = finished ? Check : active ? ArrowRight : Circle;
        return <li key={phase.id}>
          <button type="button" onClick={() => onPreview(phase.steps.find(step => !progress.steps[step.id]?.done) ?? phase.steps[0])}
            className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm ${active ? "bg-success-subtle" : "hover:bg-muted"}`}
            aria-label={`Посмотреть этап: ${phase.label}`} aria-current={active ? "step" : undefined}>
            <Icon className={`h-4 w-4 shrink-0 ${active || finished ? "text-success" : "text-muted-foreground"}`} aria-hidden />
            <span className="min-w-0 flex-1 font-medium">{phase.label}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{finished ? "Завершён" : active ? `${done}/${phase.steps.length}` : ""}</span>
          </button>
          {active ? <ol className="ml-6 space-y-0.5 py-1">
            {phase.steps.map(step => {
              const state = progress.steps[step.id];
              const stepActive = step.id === current?.id;
              const remaining = now != null ? stepRemainingSeconds(step, state, now) : null;
              const StepIcon = state?.done ? Check : state?.timerStartedAt ? Timer : stepActive ? ArrowRight : Circle;
              return <li key={step.id}><button type="button" onClick={() => onPreview(step)} aria-current={stepActive ? "step" : undefined}
                className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-xs hover:bg-muted ${stepActive ? "font-semibold text-success" : "text-foreground"}`}>
                <StepIcon className={`h-3.5 w-3.5 shrink-0 ${state?.done ? "text-success" : "text-muted-foreground"}`} aria-hidden />
                <span className="min-w-0 flex-1">{step.title}{step.ingredientName && step.amountLabel ? ` · ${step.amountLabel}` : ""}{state?.timerStartedAt && step.ingredientName && !state.done ? " · внесён" : ""}{state?.skipped ? " · пропущено" : ""}</span>
                {remaining != null && !state?.done ? <span className="shrink-0 tabular-nums">{fmtClock(remaining)}</span> : null}
              </button></li>;
            })}
          </ol> : null}
        </li>;
      })}
    </ol>
  </details>;
}
