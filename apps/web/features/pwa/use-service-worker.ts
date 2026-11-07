"use client";

// =============================================================================
//  features/pwa/use-service-worker.ts
//  Регистрация service worker (/sw.js) при загрузке приложения. До сих пор SW
//  ставился только тем, кто включал пуши (features/notifications/use-push-
//  subscription.ts) — остальные пользователи оставались вовсе без него, а
//  значит без офлайн-слоя (P3) и корректной установки PWA.
//  Только production: в `next dev` кэширующий SW конфликтует с HMR и
//  протухшими чанками (страница виснет на старом бандле после правок).
//  NEXT_PUBLIC_ENABLE_SW=1 — лазейка для e2e-прогона PWA на не-прод сборке
//  (next build && next start), без переключения NODE_ENV.
//  register("/sw.js") идемпотентен: если пользователь потом включит пуши,
//  use-push-subscription зарегистрирует тот же файл повторно — без конфликта.
// =============================================================================
import { useEffect } from "react";

export function useServiceWorkerRegistration(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (!window.isSecureContext) return;

    const allowNonProd = process.env.NEXT_PUBLIC_ENABLE_SW === "1";
    if (process.env.NODE_ENV !== "production" && !allowNonProd) return;

    let registration: ServiceWorkerRegistration | undefined;
    const register = () => navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then(value => { registration = value; })
      .catch(() => { /* Progressive enhancement; retry on a later online/focus event. */ });
    const update = () => {
      if (document.visibilityState === "hidden" || !navigator.onLine) return;
      if (registration) void registration.update().catch(() => {});
      else void register();
    };
    void register();
    window.addEventListener("online", update);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
}
