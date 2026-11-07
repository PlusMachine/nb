"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import {
  applyOfflineBrew, canApplyOfflineBrew, OFFLINE_BREW_VERSION, offlineBrewCommandSchema,
  offlineBrewValues, stableOfflineJson, type OfflineBrewCommand, type OfflineBrewSnapshot
} from "./model";
import {
  changeOfflineBrew, makeOfflineBrewOperation, OFFLINE_BREW_CHANNEL, offlineBrewOwner,
  prepareOfflineBrew, projectOfflineBrew, readOfflineBrew, type OfflineBrewRecord
} from "./storage";

type Network = "online" | "offline" | "sending" | "auth";
type SyncReply = { snapshot?: OfflineBrewSnapshot; error?: string };
type SaveResult = { ok: boolean; message: string };

async function requestSnapshot(url: string, init: RequestInit, signal: AbortSignal) {
  const request = new AbortController();
  const abort = () => request.abort();
  const timer = window.setTimeout(abort, 8000);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  try {
    const response = await fetch(url, { ...init, cache: "no-store", signal: request.signal });
    const data = await response.json().catch(() => ({})) as SyncReply;
    return { response, data };
  } finally {
    window.clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

export function useOfflineBrewStore(ownerId: string, batchId: string, initial?: OfflineBrewSnapshot) {
  const [record, setRecord] = useState<OfflineBrewRecord>();
  const [network, setNetwork] = useState<Network>("online");
  const [initialError, setInitialError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const life = useRef<AbortController | null>(null);
  const running = useRef<AbortController | null>(null);
  const channel = useRef<BroadcastChannel>();
  const nextAttempt = useRef(0);
  const failures = useRef(0);
  const rateLimitedUntil = useRef(0);
  const needsSession = useRef(false);
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const endpoint = `/api/brew-batches/${encodeURIComponent(batchId)}/offline`;

  const publish = useCallback((next: OfflineBrewRecord | undefined, announce = false) => {
    if (!next || offlineBrewOwner() !== ownerId) return;
    setRecord(previous => previous && previous.serial > next.serial ? previous : next);
    if (announce) channel.current?.postMessage({ ownerId, batchId });
  }, [ownerId, batchId]);

  const sync = useCallback(async (refresh: boolean) => {
    const session = life.current;
    if (!session || session.signal.aborted || running.current === session || offlineBrewOwner() !== ownerId) return;
    if (needsSession.current && !refresh) return;
    if (!navigator.onLine) { setNetwork("offline"); return; }
    if (Date.now() < Math.max(nextAttempt.current, rateLimitedUntil.current)) return;
    running.current = session;
    try {
      while (!session.signal.aborted && offlineBrewOwner() === ownerId) {
        const current = await readOfflineBrew(ownerId, batchId);
        if (!current || current.block || session.signal.aborted || offlineBrewOwner() !== ownerId) break;
        const operation = current.queue[0];
        if (!operation && !refresh) break;
        if (operation) setNetwork("sending");
        const { response, data } = await requestSnapshot(operation ? endpoint : `${endpoint}?owner=${encodeURIComponent(ownerId)}`, operation ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: OFFLINE_BREW_VERSION, ownerId, operation })
        } : {}, session.signal);
        if (session.signal.aborted || offlineBrewOwner() !== ownerId) break;
        if (response.status === 401) {
          needsSession.current = true;
          setNetwork("auth");
          break;
        }
        needsSession.current = false;
        if (response.status === 429) {
          rateLimitedUntil.current = Date.now() + Math.max(1, Number(response.headers.get("Retry-After")) || 60) * 1000;
          setNetwork("online");
          break;
        }
        if (response.status >= 500) throw new Error("UNAVAILABLE");
        const snapshot = data.snapshot;
        const valid = snapshot?.version === OFFLINE_BREW_VERSION && snapshot.ownerId === ownerId && snapshot.batchId === batchId;
        if (response.ok && !valid) throw new Error("INVALID_RESPONSE");

        const next = await changeOfflineBrew(ownerId, batchId, latest => {
          if (!latest || latest.block) return latest;
          // Another tab may already have acknowledged this operation. Its newer
          // snapshot wins, even when the duplicate response arrived later.
          if (operation ? latest.queue[0]?.id !== operation.id : latest.serial !== current.serial) return latest;
          if (response.ok && snapshot && valid) {
            return { ...latest, snapshot, queue: operation ? latest.queue.slice(1) : latest.queue, savedAt: new Date().toISOString() };
          }
          const message = response.status === 409 ? "Эта запись изменилась на другом устройстве. Выберите, что сохранить."
            : response.status === 404 ? "Партия удалена или недоступна. Локальные записи можно скачать."
            : data.error === "BREW_MEASUREMENT_QUOTA_REACHED" ? "В журнале уже 300 замеров. Освободите место и повторите отправку."
            : "Сервер не принял изменение. Локальная запись сохранена.";
          return { ...latest, block: { message, ...(valid ? { snapshot } : {}) } };
        });
        if (session.signal.aborted) break;
        publish(next, next?.serial !== current.serial);
        setNetwork("online");
        failures.current = 0;
        nextAttempt.current = 0;
        refresh = false;
        if (!next?.queue.length || next.block) break;
      }
    } catch {
      if (!session.signal.aborted) {
        failures.current += 1;
        nextAttempt.current = Date.now() + Math.min(60_000, 1500 * 2 ** Math.min(failures.current, 6)) + Math.random() * 1000;
        setNetwork("offline");
      }
    } finally {
      if (running.current === session) running.current = null;
    }
  }, [ownerId, batchId, endpoint, publish]);

  useEffect(() => {
    const session = new AbortController();
    life.current = session;
    if (!navigator.onLine) setNetwork("offline");
    if (typeof BroadcastChannel !== "undefined") channel.current = new BroadcastChannel(OFFLINE_BREW_CHANNEL);
    const broadcast = channel.current;
    if (broadcast) broadcast.onmessage = event => {
      if (event.data?.ownerId !== ownerId || event.data?.batchId !== batchId) return;
      void readOfflineBrew(ownerId, batchId).then(next => {
        if (!session.signal.aborted) publish(next);
      }).catch(() => {});
    };

    const start = async () => {
      if (offlineBrewOwner() !== ownerId) return;
      const seed = initialRef.current;
      const saved = seed ? await prepareOfflineBrew(seed) : await readOfflineBrew(ownerId, batchId);
      if (session.signal.aborted) return;
      if (!saved) { setInitialError("Партия ещё не сохранена на этом устройстве."); return; }
      publish(saved);
      void navigator.storage?.persist?.().catch(() => {});
      void sync(true);
    };
    void start().catch(() => {
      if (!session.signal.aborted) setInitialError("Не удалось сохранить партию на устройстве.");
    });

    const online = () => { nextAttempt.current = 0; setNetwork("online"); void sync(true); };
    const offline = () => setNetwork("offline");
    const focus = () => { if (document.visibilityState === "visible") void sync(true); };
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void sync(false); }, 5000);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      session.abort();
      broadcast?.close();
      if (channel.current === broadcast) channel.current = undefined;
      window.clearInterval(interval);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [ownerId, batchId, publish, sync]);

  useEffect(() => { if (initial) void sync(true); }, [initial, sync]);

  const save = async (...commands: OfflineBrewCommand[]): Promise<SaveResult> => {
    if (offlineBrewOwner() !== ownerId) return { ok: false, message: "Войдите в аккаунт, которому принадлежит партия." };
    try {
      const next = await changeOfflineBrew(ownerId, batchId, current => {
        if (!current) throw new Error("Подождите, пока партия сохранится на устройстве.");
        let projected = projectOfflineBrew(current);
        const queue = [...current.queue];
        for (const command of commands) {
          const parsed = offlineBrewCommandSchema.safeParse(command);
          if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Проверьте введённые данные.");
          if (!canApplyOfflineBrew(projected, parsed.data)) throw new Error("Этап партии изменился. Проверьте план и повторите.");
          const operation = makeOfflineBrewOperation(projected, parsed.data);
          queue.push(operation);
          projected = applyOfflineBrew(projected, operation);
        }
        return { ...current, queue };
      });
      publish(next, true);
      setStorageError(null);
      void sync(false);
      return { ok: true, message: "Сохранено на устройстве" };
    } catch (error) {
      const message = error instanceof Error && !(error instanceof DOMException) ? error.message : "Не удалось записать данные на устройство. Проверьте доступное место.";
      return { ok: false, message };
    }
  };

  const resolve = async (keepLocal: boolean) => {
    if (offlineBrewOwner() !== ownerId) return;
    try {
      const next = await changeOfflineBrew(ownerId, batchId, current => {
        const server = current?.block?.snapshot;
        const operation = current?.queue[0];
        if (!current || !server || !operation || operation.id !== record?.queue[0]?.id) return current;
        if (keepLocal && !canApplyOfflineBrew(server, operation.command)) return current;
        const queue = keepLocal ? [{ ...operation, id: crypto.randomUUID(), before: stableOfflineJson(offlineBrewValues(server, operation.command)) }, ...current.queue.slice(1)] : current.queue.slice(1);
        return { ...current, snapshot: server, queue, block: undefined };
      });
      publish(next, true);
      void sync(false);
    } catch {
      setStorageError("Не удалось сохранить выбор на устройстве. Повторите попытку.");
    }
  };

  const retry = async () => {
    nextAttempt.current = 0;
    try {
      const next = await changeOfflineBrew(ownerId, batchId, current => current?.block && !current.block.snapshot
        ? { ...current, block: undefined } : current);
      publish(next, true);
      await sync(true);
    } catch {
      setStorageError("Не удалось прочитать локальные записи.");
    }
  };

  const snapshot = useMemo(() => record ? projectOfflineBrew(record) : initial, [record, initial]);
  return { record, snapshot, network, initialError, storageError, save, resolve, retry };
}

export type OfflineBrewStore = ReturnType<typeof useOfflineBrewStore>;
export const OfflineBrewContext = createContext<OfflineBrewStore | null>(null);

export function useOfflineBrew(batchId: string) {
  const store = useContext(OfflineBrewContext);
  return store?.snapshot?.batchId === batchId ? store : null;
}
