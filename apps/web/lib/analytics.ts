"use client";

import posthog from "posthog-js";
import { clientEnv } from "./env";

let ready = false;

export const initAnalytics = () => {
  if (ready || !clientEnv.NEXT_PUBLIC_POSTHOG_KEY) return;
  posthog.init(clientEnv.NEXT_PUBLIC_POSTHOG_KEY, { api_host: clientEnv.NEXT_PUBLIC_POSTHOG_HOST });
  ready = true;
};

export const trackEvent = (event: string, properties?: Record<string, unknown>) => {
  if (!clientEnv.NEXT_PUBLIC_POSTHOG_KEY) return;
  posthog.capture(event, properties);
};
