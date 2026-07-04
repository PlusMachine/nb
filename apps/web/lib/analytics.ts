"use client";

import posthog from "posthog-js";
import { clientEnv } from "./env";

let ready = false;

// Инициализация с ОТКЛЮЧЁННЫМ по умолчанию сбором: PostHog не пишет события и не
// ставит cookie, пока не получено согласие пользователя (opt-in). Так аналитика не
// стартует до явного согласия — требование по cookie-комплаенсу.
const ensureInitialized = () => {
  if (ready || !clientEnv.NEXT_PUBLIC_POSTHOG_KEY) return;
  posthog.init(clientEnv.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: clientEnv.NEXT_PUBLIC_POSTHOG_HOST,
    opt_out_capturing_by_default: true,
    persistence: "localStorage+cookie"
  });
  ready = true;
};

// Включить/выключить сбор аналитики по решению пользователя в cookie-баннере.
// enabled=true → инициализируем (если нужно) и включаем сбор; false → выключаем.
export const setAnalyticsEnabled = (enabled: boolean) => {
  if (!clientEnv.NEXT_PUBLIC_POSTHOG_KEY) return;
  if (enabled) {
    ensureInitialized();
    posthog.opt_in_capturing();
  } else if (ready) {
    posthog.opt_out_capturing();
  }
};

export const trackEvent = (event: string, properties?: Record<string, unknown>) => {
  if (!clientEnv.NEXT_PUBLIC_POSTHOG_KEY || !ready) return;
  posthog.capture(event, properties);
};
