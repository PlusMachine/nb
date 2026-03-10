import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(32),
  AUTH_FROM_EMAIL: z.string().email().default("no-reply@localhost.dev"),
  SENTRY_DSN: z.string().optional(),
  POSTHOG_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().default("https://app.posthog.com"),
  STORAGE_PROVIDER: z.enum(["mock", "s3"]).default("mock"),
  STORAGE_BUCKET: z.string().min(1).default("nb-local"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: z.coerce.boolean().default(false),
  AUTH_GOOGLE_CLIENT_ID: z.string().optional(),
  AUTH_GOOGLE_CLIENT_SECRET: z.string().optional(),
  AUTH_VK_CLIENT_ID: z.string().optional(),
  AUTH_VK_CLIENT_SECRET: z.string().optional(),
  AUTH_YANDEX_CLIENT_ID: z.string().optional(),
  AUTH_YANDEX_CLIENT_SECRET: z.string().optional(),
  AUTH_CAPTCHA_SECRET: z.string().optional()
});

const clientEnvSchema = z.object({
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().default("https://app.posthog.com"),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_AUTH_CAPTCHA_SITE_KEY: z.string().optional()
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;

export const parseServerEnv = (env: Record<string, string | undefined>): ServerEnv => {
  const parsed = serverEnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid server environment variables: ${parsed.error.message}`);
  }
  return parsed.data;
};

export const parseClientEnv = (env: Record<string, string | undefined>): ClientEnv => {
  const parsed = clientEnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid client environment variables: ${parsed.error.message}`);
  }
  return parsed.data;
};
