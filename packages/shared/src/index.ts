import { z } from "zod";

const emptyStringToUndefined = (value: unknown) => value === "" ? undefined : value;

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().default("postgresql://postgres:postgres@localhost:5432/nb"),
  // Предохранители пула PostgreSQL (packages/db/src/client.ts). Дефолты разумны
  // для одного монолита; на проде тюнить под размер инстанса БД.
  DB_POOL_MAX: z.coerce.number().int().positive().default(20),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(32).default("dev-only-auth-secret-change-me-123456"),
  AUTH_FROM_EMAIL: z.string().email().default("no-reply@localhost.dev"),
  // Реквизиты оператора персональных данных (152-ФЗ) — для правовых страниц и футера.
  // Заполняются перед публикацией; в dev пустые значения допустимы (страницы покажут
  // явные плейсхолдеры вместо реальных данных). Для физлица достаточно OPERATOR_NAME
  // (ФИО) + OPERATOR_EMAIL; ИНН/ОГРН/адрес нужны для самозанятого/ИП/ООО.
  SITE_NAME: z.string().min(1).default("NB"),
  OPERATOR_TYPE: z.enum(["individual", "self_employed", "ip", "ooo"]).default("individual"),
  OPERATOR_NAME: z.preprocess(emptyStringToUndefined, z.string().optional()),
  OPERATOR_EMAIL: z.preprocess(emptyStringToUndefined, z.string().email().optional()),
  OPERATOR_INN: z.preprocess(emptyStringToUndefined, z.string().optional()),
  OPERATOR_OGRN: z.preprocess(emptyStringToUndefined, z.string().optional()),
  OPERATOR_ADDRESS: z.preprocess(emptyStringToUndefined, z.string().optional()),
  SENTRY_DSN: z.preprocess(emptyStringToUndefined, z.string().optional()),
  POSTHOG_KEY: z.preprocess(emptyStringToUndefined, z.string().optional()),
  POSTHOG_HOST: z.string().url().default("https://app.posthog.com"),
  STORAGE_PROVIDER: z.enum(["mock", "s3"]).default("mock"),
  STORAGE_BUCKET: z.string().min(1).default("nb-local"),
  STORAGE_REGION: z.string().min(1).default("auto"),
  STORAGE_ENDPOINT: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
  STORAGE_ACCESS_KEY_ID: z.preprocess(emptyStringToUndefined, z.string().optional()),
  STORAGE_SECRET_ACCESS_KEY: z.preprocess(emptyStringToUndefined, z.string().optional()),
  STORAGE_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
  // Каталог с бинарниками прошивок BrewForge. Пусто = <корень репо>/storage/firmware
  // (features/firmware/service.ts). Стор общий для CLI-публикации, веб-загрузки и
  // раздающего роута — в проде это должен быть постоянный том, не эфемерный ФС.
  FIRMWARE_STORAGE_DIR: z.preprocess(emptyStringToUndefined, z.string().optional()),
  SMTP_HOST: z.preprocess(emptyStringToUndefined, z.string().optional()),
  SMTP_PORT: z.preprocess(emptyStringToUndefined, z.coerce.number().int().positive().optional()),
  SMTP_USER: z.preprocess(emptyStringToUndefined, z.string().optional()),
  SMTP_PASSWORD: z.preprocess(emptyStringToUndefined, z.string().optional()),
  SMTP_SECURE: z.coerce.boolean().default(false),
  // SMS-авторизация (рос. номер + код). По умолчанию провайдер "log" — код пишется в
  // консоль, реальный шлюз не нужен (dev). В production задайте провайдера и реквизиты.
  SMS_PROVIDER: z.enum(["log", "smsc", "smsru"]).default("log"),
  SMS_API_KEY: z.preprocess(emptyStringToUndefined, z.string().optional()),
  SMS_LOGIN: z.preprocess(emptyStringToUndefined, z.string().optional()),
  SMS_SENDER: z.preprocess(emptyStringToUndefined, z.string().optional()),
  AUTH_VK_CLIENT_ID: z.preprocess(emptyStringToUndefined, z.string().optional()),
  AUTH_VK_CLIENT_SECRET: z.preprocess(emptyStringToUndefined, z.string().optional()),
  AUTH_YANDEX_CLIENT_ID: z.preprocess(emptyStringToUndefined, z.string().optional()),
  AUTH_YANDEX_CLIENT_SECRET: z.preprocess(emptyStringToUndefined, z.string().optional()),
  AUTH_CAPTCHA_SECRET: z.preprocess(emptyStringToUndefined, z.string().optional()),
  // Число доверенных реверс-прокси перед приложением. Клиентский `X-Forwarded-For`
  // подделывается (бот шлёт случайный IP на каждый запрос и обходит per-IP лимиты),
  // поэтому реальный IP берём не первым слева, а на этой позиции СПРАВА: последний
  // элемент проставлен ближайшим прокси, предыдущий — прокси перед ним, и т.д.
  // 0 = прокси нет (dev): доверять заголовку нельзя, IP берём из соединения.
  // 1 = один прокси (nginx/Cloudflare), который сам перезаписывает входящий XFF.
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  // Web-push (Phase 6). Пусто = пуши выключены. Приватный ключ — секрет (сервер/мост).
  VAPID_PUBLIC_KEY: z.preprocess(emptyStringToUndefined, z.string().optional()),
  VAPID_PRIVATE_KEY: z.preprocess(emptyStringToUndefined, z.string().optional()),
  VAPID_SUBJECT: z.preprocess(emptyStringToUndefined, z.string().optional())
});

const clientEnvSchema = z.object({
  NEXT_PUBLIC_POSTHOG_KEY: z.preprocess(emptyStringToUndefined, z.string().optional()),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().default("https://app.posthog.com"),
  NEXT_PUBLIC_SENTRY_DSN: z.preprocess(emptyStringToUndefined, z.string().optional()),
  NEXT_PUBLIC_AUTH_CAPTCHA_SITE_KEY: z.preprocess(emptyStringToUndefined, z.string().optional())
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;

const isLocalhostUrl = (url: string): boolean => {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
};

export const parseServerEnv = (env: Record<string, string | undefined>): ServerEnv => {
  const parsed = serverEnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid server environment variables: ${parsed.error.message}`);
  }
  return parsed.data;
};

// Забытый APP_URL в production молча увёл бы canonical/sitemap/OG-ссылки на
// localhost. Гвард живёт отдельно от parseServerEnv: парсер вызывается eagerly
// любым импортёром @nb/db (в т.ч. apps/bridge, которому APP_URL не нужен), а
// требование боевого APP_URL — обязанность только веб-рантайма (apps/web/lib/env.ts).
export const assertProductionAppUrl = (env: ServerEnv): ServerEnv => {
  if (env.NODE_ENV === "production" && isLocalhostUrl(env.APP_URL)) {
    throw new Error(
      `APP_URL указывает на localhost ("${env.APP_URL}") в production-окружении. ` +
        "Похоже, переменная APP_URL не задана для боевого домена — задайте реальный https://-адрес сайта."
    );
  }
  return env;
};

export const parseClientEnv = (env: Record<string, string | undefined>): ClientEnv => {
  const parsed = clientEnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid client environment variables: ${parsed.error.message}`);
  }
  return parsed.data;
};
