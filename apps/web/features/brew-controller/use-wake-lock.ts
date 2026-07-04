"use client";

// =============================================================================
//  features/brew-controller/use-wake-lock.ts
//  Screen Wake Lock — не даёт экрану гаснуть, пока открыт киоск (§9). API
//  работает только в secure context (HTTPS/облако); на LAN по http://192.168…
//  navigator.wakeLock либо отсутствует, либо request() падает — это штатно, не
//  баг (честная подсказка — дело kiosk-shell.tsx, см. kiosk-status.ts). Лок
//  снимается браузером при сворачивании вкладки/блокировке экрана — на
//  visibilitychange пробуем перезахватить, пока `active`. SSR-safe.
// =============================================================================
import { useEffect, useState } from "react";

export type WakeLockState = {
  /** Wake Lock API вообще есть в этом браузере (независимо от secure context). */
  supported: boolean;
  /** Лок сейчас реально удерживается (экран не гаснет). */
  engaged: boolean;
};

/** Держит экран включённым, пока `active === true`; release при false/размонтировании. */
export function useWakeLock(active: boolean): WakeLockState {
  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;
  const [engaged, setEngaged] = useState(false);

  useEffect(() => {
    if (!active || !supported) {
      setEngaged(false);
      return;
    }

    let sentinel: WakeLockSentinel | null = null;
    let acquiring = false;
    let cancelled = false;

    const acquire = async () => {
      if (acquiring || sentinel) return;
      acquiring = true;
      try {
        const s = await navigator.wakeLock.request("screen");
        acquiring = false;
        if (cancelled) {
          void s.release();
          return;
        }
        sentinel = s;
        setEngaged(true);
        // Браузер сам снимает лок (сворачивание/блокировка) — сбрасываем состояние,
        // чтобы onVisibility ниже знал, что нужно перезахватывать.
        sentinel.addEventListener("release", () => {
          sentinel = null;
          setEngaged(false);
        });
      } catch {
        // Нет secure context на LAN (http://) или браузер отказал — честно «не держим».
        acquiring = false;
        setEngaged(false);
      }
    };

    void acquire();

    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (sentinel) void sentinel.release();
      sentinel = null;
    };
  }, [active, supported]);

  return { supported, engaged };
}
