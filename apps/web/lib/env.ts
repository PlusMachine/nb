import { parseClientEnv, parseServerEnv, type ServerEnv } from "@nb/shared";

let cachedServerEnv: ServerEnv | undefined;

export const getServerEnv = (): ServerEnv => {
  cachedServerEnv ??= parseServerEnv(process.env);
  return cachedServerEnv;
};

export const clientEnv = parseClientEnv({
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN
});
