"use client";

import { clientEnv } from "./env";

type PosthogClient = typeof import("posthog-js")["default"];

let posthogClient: PosthogClient | null = null;
let ready = false;
let initPromise: Promise<void> | null = null;

// Инициализация с ОТКЛЮЧЁННЫМ по умолчанию сбором: PostHog не пишет события и не
// ставит cookie, пока не получено согласие пользователя (opt-in). Так аналитика не
// стартует до явного согласия — требование по cookie-комплаенсу.
//
// Сам пакет posthog-js грузится динамическим import(), а не статическим импортом
// сверху файла: этот модуль подключён через ConsentProvider, смонтированный
// глобально (components/providers.tsx), и статический импорт клал бы posthog-js
// в first-load JS каждой страницы — даже посетителям, которые ни разу не дали
// согласие на аналитику.
const ensureInitialized = async (): Promise<void> => {
  if (ready || !clientEnv.NEXT_PUBLIC_POSTHOG_KEY) return;
  if (!initPromise) {
    const apiKey = clientEnv.NEXT_PUBLIC_POSTHOG_KEY;
    initPromise = import("posthog-js").then(({ default: posthog }) => {
      posthog.init(apiKey, {
        api_host: clientEnv.NEXT_PUBLIC_POSTHOG_HOST,
        opt_out_capturing_by_default: true,
        persistence: "localStorage+cookie"
      });
      posthogClient = posthog;
      ready = true;
    });
  }
  await initPromise;
};

// Включить/выключить сбор аналитики по решению пользователя в cookie-баннере.
// enabled=true → инициализируем (если нужно, дозагрузив модуль) и включаем
// сбор; false → выключаем (без загрузки модуля, если он ещё не был нужен).
export const setAnalyticsEnabled = (enabled: boolean) => {
  if (!clientEnv.NEXT_PUBLIC_POSTHOG_KEY) return;
  if (enabled) {
    void ensureInitialized().then(() => posthogClient?.opt_in_capturing());
  } else if (ready) {
    posthogClient?.opt_out_capturing();
  }
};

export const trackEvent = (event: string, properties?: Record<string, unknown>) => {
  if (!clientEnv.NEXT_PUBLIC_POSTHOG_KEY || !ready) return;
  posthogClient?.capture(event, properties);
};
