"use client";

import { useEffect, useRef, useState } from "react";

import { setBrewDayStepStateAction } from "@/app/(app)/app/brew-batches/[id]/actions";
import { saveManualBrewTransferAction } from "@/app/(app)/app/brew-batches/[id]/manual-actions";
import { manualTransferInputSchema, type ManualTransferInput } from "../manual-transfer";
import { normalizeBrewDayProgress } from "../brew-day";
import { brewDayStepStatePatchSchema, emptyBrewDayProgress, type BrewDayProgress, type BrewDayStepStatePatch } from "@/features/brew-batches/contracts";

export type BrewDayStepPatch = BrewDayStepStatePatch & { transfer?: ManualTransferInput };

export type BrewDayProgressController = {
  progress: BrewDayProgress;
  pending: Record<string, boolean>;
  error: string | null;
  /** epoch-мс клиентского тика (null до монтирования — совпадение SSR/гидрации). */
  now: number | null;
  queuedCount: number;
  offline: boolean;
  retry: () => Promise<void>;
  patchStep: (stepId: string, patch: BrewDayStepPatch) => Promise<boolean>;
};

/**
 * Общий контроллер прогресса гида варочного дня: оптимистичные отметки/таймеры
 * шагов с откатом на ошибке + секундный тик для обратного отсчёта. Используется
 * и варочным днём, и брожением — единый источник состояния прогресса на странице.
 */
export function useBrewDayProgress(
  brewBatchId: string,
  initialProgress: BrewDayProgress,
  ownerId?: string
): BrewDayProgressController {
  const [progress, setProgress] = useState<BrewDayProgress>(initialProgress ?? emptyBrewDayProgress);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<Set<string>>(new Set());
  const confirmed = useRef<BrewDayProgress>(initialProgress ?? emptyBrewDayProgress);
  const patches = useRef(new Map<string, BrewDayStepPatch>());
  const generation = useRef(0);
  const [queuedCount, setQueuedCount] = useState(0);
  const [offline, setOffline] = useState(false);
  const cacheKey = ownerId ? `nb:brew-progress:v1:${ownerId}:${brewBatchId}` : null;
  const blocked = useRef(new Set<string>());
  const retryRef = useRef<() => Promise<void>>(async () => {});
  const persist = () => {
    if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify({ version: 1, confirmed: confirmed.current, queued: Object.fromEntries(patches.current) }));
    setQueuedCount(patches.current.size);
  };

  useEffect(() => {
    generation.current += 1;
    confirmed.current = initialProgress ?? emptyBrewDayProgress;
    patches.current.clear();
    inFlight.current.clear();
    setProgress(confirmed.current);
    setPending({});
    setQueuedCount(0);
    setError(null);
    blocked.current.clear();
    if (cacheKey) {
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
        if (cached?.version === 1 && cached.queued && typeof cached.queued === "object") {
          const stored = normalizeBrewDayProgress(cached.confirmed);
          if ((Date.parse(stored.updatedAt ?? "") || 0) > (Date.parse(confirmed.current.updatedAt ?? "") || 0)) confirmed.current = stored;
          for (const [id, value] of Object.entries(cached.queued)) {
            if (!value || typeof value !== "object" || Array.isArray(value)) continue;
            const parsed = brewDayStepStatePatchSchema.safeParse(value);
            if (!parsed.success) continue;
            const transfer = "transfer" in value ? manualTransferInputSchema.safeParse(value.transfer) : null;
            if (transfer && (!transfer.success || id !== "brew:transfer")) continue;
            patches.current.set(id, { ...parsed.data, ...(transfer?.success ? { transfer: transfer.data } : {}) });
          }
          setProgress(reconcile());
        }
        setQueuedCount(patches.current.size);
      } catch { setError("Не удалось прочитать сохранённые шаги на устройстве."); }
    }
    setOffline(!navigator.onLine);
    void retryRef.current();
    // При смене партии её локальные правки не переносятся на соседнюю.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brewBatchId, ownerId]);

  const reconcile = () => {
    const steps = { ...confirmed.current.steps };
    for (const [id, patch] of patches.current) {
      const current = steps[id] ?? { done: false, timerStartedAt: null };
      const { transfer: _transfer, ...statePatch } = patch;
      steps[id] = { ...current, ...statePatch, ...(patch.transfer?.gravitySg != null ? { gravitySg: patch.transfer.gravitySg } : {}), done: patch.done ?? current.done, timerStartedAt: patch.timerStartedAt !== undefined ? patch.timerStartedAt : current.timerStartedAt };
    }
    return { ...confirmed.current, steps };
  };

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const send = async (stepId: string): Promise<boolean> => {
    if (inFlight.current.has(stepId) || !patches.current.has(stepId)) return false;
    if (cacheKey && !navigator.onLine) { setOffline(true); return true; }
    const patch = patches.current.get(stepId)!;
    inFlight.current.add(stepId);
    const epoch = generation.current;
    setPending((prev) => ({ ...prev, [stepId]: true }));
    let keep = false;
    let success = false;
    try {
      const result = patch.transfer
        ? await saveManualBrewTransferAction(brewBatchId, patch.transfer)
        : await setBrewDayStepStateAction(brewBatchId, stepId, patch);
      if (epoch !== generation.current) return false;
      if (!result.ok || !result.progress) {
        setError(result.message);
        if (cacheKey) { keep = true; if (!result.retryable) blocked.current.add(stepId); else setOffline(true); }
        return false;
      }
      const timestamp = (value: string | null) => value ? Date.parse(value) || 0 : 0;
      if (timestamp(result.progress.updatedAt) > timestamp(confirmed.current.updatedAt)) {
        confirmed.current = result.progress;
      } else {
        // Ответы могут прийти не по порядку или иметь одинаковую миллисекунду.
        // Подтверждаем свой шаг, не затирая более свежие соседние шаги.
        confirmed.current = { ...confirmed.current, steps: { ...confirmed.current.steps, [stepId]: result.progress.steps[stepId] } };
      }
      success = true;
      setOffline(false);
      if (!blocked.current.size) setError(null);
      return true;
    } catch {
      if (epoch === generation.current) {
        keep = Boolean(cacheKey);
        setOffline(true);
        if (!cacheKey) setError("Не удалось сохранить шаг. Попробуйте ещё раз.");
      }
      return Boolean(cacheKey);
    } finally {
      if (epoch === generation.current) {
        const unchanged = patches.current.get(stepId) === patch;
        if (!keep && unchanged) patches.current.delete(stepId);
        inFlight.current.delete(stepId);
        try { persist(); } catch { setError("Не удалось сохранить очередь на устройстве."); }
        setProgress(reconcile());
        setPending((prev) => {
          const next = { ...prev };
          delete next[stepId];
          return next;
        });
        if (success && !unchanged) void send(stepId);
      }
    }
  };

  const patchStep = async (stepId: string, patch: BrewDayStepPatch): Promise<boolean> => {
    const existing = patches.current.get(stepId);
    const next = { ...existing, ...patch };
    if (patch.done === false) delete next.transfer;
    if (existing && JSON.stringify(existing) === JSON.stringify(next)) return true;
    const enriched = patch.done === undefined ? next : { ...next, completedAt: patch.done ? new Date().toISOString() : null };
    patches.current.set(stepId, enriched);
    blocked.current.delete(stepId);
    try { persist(); } catch {
      if (existing) patches.current.set(stepId, existing); else patches.current.delete(stepId);
      setError("Не удалось сохранить шаг на устройстве. Проверьте доступное место в браузере.");
      return false;
    }
    setError(null);
    setProgress(reconcile());
    if (inFlight.current.has(stepId)) return true;
    return send(stepId);
  };
  const retry = async () => {
    for (const id of [...patches.current.keys()]) if (!blocked.current.has(id)) await send(id);
  };
  retryRef.current = retry;
  useEffect(() => {
    const online = () => { setOffline(false); void retryRef.current(); };
    const offline = () => setOffline(true);
    const interval = setInterval(() => { if (navigator.onLine) void retryRef.current(); }, 15000);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => { clearInterval(interval); window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);
  return { progress, pending, error, now, queuedCount, offline, retry: async () => { blocked.current.clear(); setError(null); await retry(); }, patchStep };
}
