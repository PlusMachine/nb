"use client";

import { useEffect, useRef, useState } from "react";

import { setBrewDayStepStateAction } from "@/app/(app)/app/brew-batches/[id]/actions";
import { emptyBrewDayProgress, type BrewDayProgress } from "@/features/brew-batches/contracts";

export type BrewDayStepPatch = { done?: boolean; timerStartedAt?: string | null };

export type BrewDayProgressController = {
  progress: BrewDayProgress;
  pending: Record<string, boolean>;
  error: string | null;
  /** epoch-мс клиентского тика (null до монтирования — совпадение SSR/гидрации). */
  now: number | null;
  patchStep: (stepId: string, patch: BrewDayStepPatch) => Promise<void>;
};

/**
 * Общий контроллер прогресса гида варочного дня: оптимистичные отметки/таймеры
 * шагов с откатом на ошибке + секундный тик для обратного отсчёта. Используется
 * и варочным днём, и брожением — единый источник состояния прогресса на странице.
 */
export function useBrewDayProgress(
  brewBatchId: string,
  initialProgress: BrewDayProgress
): BrewDayProgressController {
  const [progress, setProgress] = useState<BrewDayProgress>(initialProgress ?? emptyBrewDayProgress);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<Set<string>>(new Set());

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const patchStep = async (stepId: string, patch: BrewDayStepPatch) => {
    if (inFlight.current.has(stepId)) {
      return;
    }
    inFlight.current.add(stepId);
    setPending((prev) => ({ ...prev, [stepId]: true }));
    setError(null);
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

  return { progress, pending, error, now, patchStep };
}
