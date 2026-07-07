import { assertProductionAppUrl, parseClientEnv, parseServerEnv, type ServerEnv } from "@nb/shared";

let cachedServerEnv: ServerEnv | undefined;

export const getServerEnv = (): ServerEnv => {
  // Гвард боевого APP_URL — именно здесь, а не в parseServerEnv: canonical/
  // sitemap/OG зависят от APP_URL только в веб-рантайме, bridge живёт без него.
  cachedServerEnv ??= assertProductionAppUrl(parseServerEnv(process.env));
  return cachedServerEnv;
};

export const clientEnv = parseClientEnv({
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_AUTH_CAPTCHA_SITE_KEY: process.env.NEXT_PUBLIC_AUTH_CAPTCHA_SITE_KEY
});
