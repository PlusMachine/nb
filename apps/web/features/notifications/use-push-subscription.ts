"use client";

// =============================================================================
//  features/notifications/use-push-subscription.ts
//  Клиентский хук web-push подписки (Phase 6): детект поддержки, регистрация
//  service worker (/sw.js), запрос разрешения, подписка через PushManager с
//  applicationServerKey (публичный VAPID с /public-key) и синхронизация с сервером
//  (/subscribe, /unsubscribe). Всё браузерное — под guard'ами (SSR-безопасно).
// =============================================================================
import { useCallback, useEffect, useState } from "react";

export type PushState =
  | "unsupported" // нет serviceWorker/PushManager/Notification
  | "unconfigured" // сервер без VAPID — пуши недоступны
  | "denied" // пользователь запретил уведомления
  | "default" // ещё не спрашивали / выключено
  | "subscribed"; // подписка активна

type Hook = {
  state: PushState;
  busy: boolean;
  error: string | null;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
};

/** base64url (VAPID public key) → Uint8Array для applicationServerKey. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function fetchPublicKey(): Promise<string | null> {
  try {
    const res = await fetch("/api/notifications/public-key", { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { publicKey?: string | null };
    return body.publicKey ?? null;
  } catch {
    return null;
  }
}

export function usePushSubscription(): Hook {
  const [state, setState] = useState<PushState>("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Первичная синхронизация состояния: поддержка → разрешение → активная подписка.
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      if (!isSupported()) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      const publicKey = await fetchPublicKey();
      if (!publicKey) {
        if (!cancelled) setState("unconfigured");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (!cancelled) setState(sub ? "subscribed" : "default");
      } catch {
        if (!cancelled) setState("default");
      }
    };
    void sync();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (!isSupported()) {
        setState("unsupported");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "default");
        return;
      }
      const publicKey = await fetchPublicKey();
      if (!publicKey) {
        setState("unconfigured");
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // Переиспользуем существующую подписку, иначе создаём новую.
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          // Cast: Uint8Array<ArrayBufferLike> не совпадает с BufferSource в lib.dom
          // (SharedArrayBuffer в union) — в рантайме это валидный applicationServerKey.
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource
        }));

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const res = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
          userAgent: navigator.userAgent
        })
      });
      if (!res.ok) {
        setError("Не удалось сохранить подписку");
        return;
      }
      setState("subscribed");
    } catch (err) {
      setError((err as Error).message || "Не удалось включить уведомления");
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      const endpoint = sub?.endpoint;
      if (sub) await sub.unsubscribe();
      if (endpoint) {
        await fetch("/api/notifications/unsubscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint })
        });
      }
      setState("default");
    } catch (err) {
      setError((err as Error).message || "Не удалось выключить уведомления");
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, error, enable, disable };
}
