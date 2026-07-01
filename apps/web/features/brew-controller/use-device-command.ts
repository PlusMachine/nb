"use client";

// =============================================================================
//  features/brew-controller/use-device-command.ts
//  Клиентский хук управления устройством (Phase 2): держит per-tab sessionId,
//  ведёт control-lease (acquire + heartbeat-loop, release при уходе), шлёт команды
//  с sessionId, разбирает серверные 409 (DEVICE_STALE / NO_CONTROL_LEASE) в
//  человеко-понятный текст и даёт «отложенную отправку с undo» для SKIP_STAGE.
//
//  Аренда — на УСТРОЙСТВО; leaseUrl/commandUrl приходят из telemetryEndpoints
//  (зона A → /api/brew-batches/…, зона B → /api/devices/…), поэтому хук общий.
//  Клиентский controlsDisabled — лишь UX; настоящий hard-гейт на сервере.
// =============================================================================
import { useCallback, useEffect, useRef, useState } from "react";

import type { Ack, Command } from "@nb/brewforge-protocol";
import type { LeaseStatus } from "./control-lease";

// Продлеваем аренду заметно чаще её TTL (45с на сервере), чтобы при живом операторе
// она не истекала из-за джиттера сети.
const HEARTBEAT_MS = 15_000;
// Окно undo для отложенных команд (SKIP): столько ждём перед реальной отправкой.
const UNDO_WINDOW_MS = 5_000;

export type SendResult = {
  ok: boolean;
  ack?: Ack | null;
  /** Человеко-понятная причина отказа (или null при успехе). */
  error?: string | null;
  /** Стабильный код ошибки сервера (DEVICE_STALE / NO_CONTROL_LEASE / …). */
  code?: string | null;
};

/** Активная отложенная команда с окном отмены. */
export type PendingUndo = {
  /** Что произойдёт (для тоста), напр. «Стадия пропущена». */
  label: string;
  /** Отменить — команда НЕ будет отправлена. */
  cancel: () => void;
  /** Отправить немедленно, не дожидаясь окончания окна. */
  commitNow: () => void;
};

type Options = {
  commandUrl: string;
  leaseUrl: string;
  /** Вести аренду/heartbeat только когда за источником есть устройство. */
  enabled: boolean;
};

/** Стабильный per-tab идентификатор управляющего сеанса (переживает reload вкладки). */
function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  const KEY = "nb_control_session_id";
  try {
    const existing = window.sessionStorage.getItem(KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `s-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    window.sessionStorage.setItem(KEY, id);
    return id;
  } catch {
    // приватный режим/недоступный storage — эфемерный id на время жизни модуля
    return `s-${Math.random().toString(36).slice(2)}`;
  }
}

export function useDeviceCommand({ commandUrl, leaseUrl, enabled }: Options) {
  const [sessionId] = useState<string>(() => getSessionId());
  const [lease, setLease] = useState<LeaseStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [undo, setUndo] = useState<PendingUndo | null>(null);

  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- control-lease: acquire + heartbeat-loop -----------------------------
  const callLease = useCallback(
    async (action: "acquire" | "heartbeat" | "release" | "request-takeover"): Promise<LeaseStatus | null> => {
      try {
        const res = await fetch(leaseUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, sessionId }),
          keepalive: action === "release", // долетит даже при закрытии вкладки
        });
        if (!res.ok) return null;
        const body = (await res.json()) as { lease?: LeaseStatus };
        if (body.lease) {
          setLease(body.lease);
          return body.lease;
        }
        return null;
      } catch {
        return null;
      }
    },
    [leaseUrl, sessionId],
  );

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void callLease("acquire");
    const id = window.setInterval(() => {
      if (active) void callLease("heartbeat");
    }, HEARTBEAT_MS);
    return () => {
      active = false;
      window.clearInterval(id);
      // Освобождаем аренду при уходе — чтобы другой сеанс сразу взял управление.
      void callLease("release");
    };
  }, [enabled, callLease]);

  const requestTakeover = useCallback(async () => {
    await callLease("request-takeover");
  }, [callLease]);

  // Отдать управление явно (кнопка «Передать», когда другой сеанс просит перехват).
  const release = useCallback(async () => {
    await callLease("release");
  }, [callLease]);

  // --- отправка команды ----------------------------------------------------
  const send = useCallback(
    async (command: Command): Promise<SendResult> => {
      setPending(true);
      try {
        const res = await fetch(commandUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ command, sessionId }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ack?: Ack;
          error?: string;
          code?: string;
        };
        if (!res.ok || body.error) {
          // Потеряли аренду — обновим статус, чтобы UI показал «управляет другой».
          if (body.code === "NO_CONTROL_LEASE") void callLease("heartbeat");
          return { ok: false, error: body.error ?? "Не удалось отправить команду", code: body.code ?? null };
        }
        const ack = body.ack ?? null;
        if (ack && !ack.ok) {
          return { ok: false, ack, error: `Устройство отклонило команду: ${ack.reason}`, code: ack.reason };
        }
        return { ok: true, ack, error: null };
      } catch (error) {
        return { ok: false, error: `Ошибка сети: ${(error as Error).message}`, code: "NETWORK" };
      } finally {
        setPending(false);
      }
    },
    [commandUrl, sessionId, callLease],
  );

  // --- отложенная отправка с undo (SKIP_STAGE) -----------------------------
  const clearUndoTimer = useCallback(() => {
    if (undoTimer.current) {
      clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
  }, []);

  const scheduleUndoable = useCallback(
    (command: Command, opts: { label: string; onResult?: (r: SendResult) => void }) => {
      // Если уже есть отложенная — отправляем её немедленно (по одной за раз).
      clearUndoTimer();
      const commit = () => {
        clearUndoTimer();
        setUndo(null);
        void send(command).then((r) => opts.onResult?.(r));
      };
      const cancel = () => {
        clearUndoTimer();
        setUndo(null);
      };
      setUndo({ label: opts.label, cancel, commitNow: commit });
      undoTimer.current = setTimeout(commit, UNDO_WINDOW_MS);
    },
    [send, clearUndoTimer],
  );

  useEffect(() => () => clearUndoTimer(), [clearUndoTimer]);

  return {
    sessionId,
    lease,
    /** Управляю ли я устройством (держу валидную аренду). */
    controlsHeld: lease?.heldByMe ?? false,
    pending,
    send,
    requestTakeover,
    release,
    scheduleUndoable,
    undo,
  };
}
