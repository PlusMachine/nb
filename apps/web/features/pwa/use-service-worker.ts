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

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Ошибку регистрации глотаем молча — SW прогрессивное улучшение,
      // приложение обязано остаться рабочим и без него.
    });
  }, []);
}
