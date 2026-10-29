"use client";

import type { LeaseStatus } from "./control-lease";

let fallbackSessionId: string | undefined;

function newControlSessionId(): string {
  // randomUUID недоступен на части HTTP LAN-адресов; getRandomValues там работает.
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Один идентификатор вкладки для пульта и обоих диалогов запуска. */
export function getControlSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  const key = "nb_control_session_id";
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const id = newControlSessionId();
    window.sessionStorage.setItem(key, id);
    return id;
  } catch {
    // Несколько потребителей одной вкладки должны совпадать и без storage.
    return fallbackSessionId ??= newControlSessionId();
  }
}

/** Перед подтвержденным стартом берем только свободную или уже свою аренду. */
export async function acquireStartControlLease(deviceId: string): Promise<string> {
  const sessionId = getControlSessionId();
  let response: Response;
  try {
    response = await fetch(`/api/devices/${encodeURIComponent(deviceId)}/control-lease`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "acquire", sessionId })
    });
  } catch { throw new Error("CONTROL_UNAVAILABLE"); }
  if (!response.ok) throw new Error("CONTROL_UNAVAILABLE");
  const body = await response.json().catch(() => null) as { lease?: LeaseStatus } | null;
  if (body?.lease?.heldByMe !== true) throw new Error("NO_CONTROL_LEASE");
  return sessionId;
}
