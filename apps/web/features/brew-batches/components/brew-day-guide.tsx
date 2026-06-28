"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, Loader2, Play, RotateCcw, Timer } from "lucide-react";

import { setBrewDayStepStateAction } from "@/app/(app)/app/brew-batches/[id]/actions";
import {
  emptyBrewDayProgress,
  type BrewDayProgress,
  type BrewDayStageGroup,
  type BrewDayStep
} from "@/features/brew-batches/contracts";

const fmtClock = (totalSeconds: number): string => {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

// Оставшиеся секунды таймера: длительность − (сейчас − старт). null — не запущен.
const remainingSeconds = (step: BrewDayStep, startedAtIso: string | null, nowMs: number): number | null => {
  if (!startedAtIso || step.durationSeconds == null) {
    return null;
  }
  const startedMs = new Date(startedAtIso).getTime();
  if (!Number.isFinite(startedMs)) {
    return null;
  }
  return step.durationSeconds - (nowMs - startedMs) / 1000;
};

export function BrewDayGuide({
  brewBatchId,
  groups,
  initialProgress
}: {
  brewBatchId: string;
  groups: BrewDayStageGroup[];
  initialProgress: BrewDayProgress;
}) {
  const [progress, setProgress] = useState<BrewDayProgress>(initialProgress ?? emptyBrewDayProgress);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<Set<string>>(new Set());

  // Тик 1с для обратного отсчёта. now = null до монтирования, чтобы серверный
  // рендер и гидрация совпадали (отсчёт — клиентское время).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const total = groups.reduce((sum, group) => sum + group.steps.length, 0);
  const doneCount = groups.reduce(
    (sum, group) => sum + group.steps.filter((step) => progress.steps[step.id]?.done).length,
    0
  );

  const patchStep = async (stepId: string, patch: { done?: boolean; timerStartedAt?: string | null }) => {
    if (inFlight.current.has(stepId)) {
      return;
    }
    inFlight.current.add(stepId);
    setPending((prev) => ({ ...prev, [stepId]: true }));
    setError(null);
    // Оптимистичное обновление; на ошибке откатываем к предыдущему состоянию.
    const previous = progress;
    setProgress((prev) => {
      const current = prev.steps[stepId] ?? { done: false, timerStartedAt: null };
      return {
        steps: {
          ...prev.steps,
          [stepId]: {
            done: patch.done ?? current.done,
            timerStartedAt: patch.timerStartedAt !== undefined ? patch.timerStartedAt : current.timerStartedAt
          }
        },
        updatedAt: prev.updatedAt
      };
    });
    try {
      const result = await setBrewDayStepStateAction(brewBatchId, stepId, patch);
      if (!result.ok || !result.progress) {
        setProgress(previous);
        setError(result.message);
        return;
      }
      setProgress(result.progress);
    } catch {
      setProgress(previous);
      setError("Не удалось сохранить шаг. Попробуйте ещё раз.");
    } finally {
      inFlight.current.delete(stepId);
      setPending((prev) => {
        const next = { ...prev };
        delete next[stepId];
        return next;
      });
    }
  };

  if (total === 0) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-zinc-900">Варочный день</h2>
        <span className="text-xs tabular-nums text-zinc-500">{doneCount} / {total}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: total ? `${Math.round((doneCount / total) * 100)}%` : "0%" }}
        />
      </div>

      {error ? <p role="alert" className="text-xs text-rose-600">{error}</p> : null}

      <div className="space-y-5">
        {groups.map((group) => (
          <div key={group.stage} className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{group.label}</h3>
            <ul className="space-y-1.5">
              {group.steps.map((step) => {
                const state = progress.steps[step.id] ?? { done: false, timerStartedAt: null };
                const busy = Boolean(pending[step.id]);
                const isTimer = step.kind === "timer" && step.durationSeconds != null;
                const remaining = isTimer && now != null ? remainingSeconds(step, state.timerStartedAt, now) : null;
                const timerRunning = isTimer && state.timerStartedAt != null;
                const timerDone = remaining != null && remaining <= 0;

                return (
                  <li
                    key={step.id}
                    className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 transition ${
                      state.done ? "border-emerald-200 bg-emerald-50/50" : "border-zinc-100 bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => patchStep(step.id, { done: !state.done })}
                      disabled={busy}
                      aria-pressed={state.done}
                      aria-label={state.done ? "Снять отметку" : "Отметить шаг выполненным"}
                      className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition disabled:opacity-50 ${
                        state.done
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-zinc-300 bg-white text-transparent hover:border-zinc-400"
                      }`}
                    >
                      {busy ? <Loader2 className="h-3 w-3 animate-spin text-zinc-400" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${state.done ? "text-zinc-500 line-through" : "text-zinc-900"}`}>
                        {step.title}
                      </p>
                      {step.detail ? <p className="text-xs text-zinc-500">{step.detail}</p> : null}
                    </div>

                    {isTimer ? (
                      <div className="flex shrink-0 items-center gap-2">
                        {timerRunning ? (
                          <>
                            <span
                              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                                timerDone ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              <Timer className="h-3.5 w-3.5" aria-hidden />
                              {now == null ? "—" : timerDone ? "готово" : fmtClock(remaining ?? 0)}
                            </span>
                            <button
                              type="button"
                              onClick={() => patchStep(step.id, { timerStartedAt: null })}
                              disabled={busy}
                              aria-label="Сбросить таймер"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
                            >
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => patchStep(step.id, { timerStartedAt: new Date().toISOString() })}
                            disabled={busy}
                            aria-label="Запустить таймер"
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 px-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                          >
                            <Play className="h-3.5 w-3.5" aria-hidden />
                            {step.durationSeconds != null ? fmtClock(step.durationSeconds) : "Таймер"}
                          </button>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
