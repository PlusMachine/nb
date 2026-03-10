import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  SENTRY_DSN: z.string().optional(),
  POSTHOG_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().default("https://app.posthog.com"),
  STORAGE_PROVIDER: z.enum(["mock", "s3"]).default("mock"),
  STORAGE_BUCKET: z.string().min(1).default("nb-local")
});

const clientEnvSchema = z.object({
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().default("https://app.posthog.com"),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional()
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
