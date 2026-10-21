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
  const confirmed = useRef<BrewDayProgress>(initialProgress ?? emptyBrewDayProgress);
  const patches = useRef(new Map<string, BrewDayStepPatch>());
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    confirmed.current = initialProgress ?? emptyBrewDayProgress;
    patches.current.clear();
    inFlight.current.clear();
    setProgress(confirmed.current);
    setPending({});
    setError(null);
    // При смене партии её локальные правки не переносятся на соседнюю.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brewBatchId]);

  const reconcile = () => {
    const steps = { ...confirmed.current.steps };
    for (const [id, patch] of patches.current) {
      const current = steps[id] ?? { done: false, timerStartedAt: null };
      steps[id] = { done: patch.done ?? current.done, timerStartedAt: patch.timerStartedAt !== undefined ? patch.timerStartedAt : current.timerStartedAt };
    }
    return { ...confirmed.current, steps };
  };

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
    const epoch = generation.current;
    patches.current.set(stepId, patch);
    setPending((prev) => ({ ...prev, [stepId]: true }));
    setError(null);
    setProgress(reconcile());
    try {
      const result = await setBrewDayStepStateAction(brewBatchId, stepId, patch);
      if (epoch !== generation.current) return;
      if (!result.ok || !result.progress) {
        setError(result.message);
        return;
      }
      const timestamp = (value: string | null) => value ? Date.parse(value) || 0 : 0;
      if (timestamp(result.progress.updatedAt) > timestamp(confirmed.current.updatedAt)) {
        confirmed.current = result.progress;
      } else {
        // Ответы могут прийти не по порядку или иметь одинаковую миллисекунду.
        // Подтверждаем свой шаг, не затирая более свежие соседние шаги.
        confirmed.current = { ...confirmed.current, steps: { ...confirmed.current.steps, [stepId]: result.progress.steps[stepId] } };
      }
    } catch {
      if (epoch === generation.current) setError("Не удалось сохранить шаг. Попробуйте ещё раз.");
    } finally {
      if (epoch === generation.current) {
        patches.current.delete(stepId);
        inFlight.current.delete(stepId);
        setProgress(reconcile());
        setPending((prev) => {
          const next = { ...prev };
          delete next[stepId];
          return next;
        });
      }
    }
  };

  return { progress, pending, error, now, patchStep };
}
