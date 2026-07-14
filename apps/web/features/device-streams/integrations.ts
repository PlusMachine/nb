import crypto from "node:crypto";

import { assertRateLimit, createRandomToken, hashToken } from "@nb/auth";
import { and, brewDevices, count, db, eq, userIntegrations, users } from "@nb/db";

import { RAPT_PROVIDER_ID } from "@/features/brew-controller/rapt-cloud-provider";
import { decryptDeviceToken, encryptDeviceToken } from "@/lib/device-token-crypto";
import { getServerEnv } from "@/lib/env";

import {
  RAPT_INTEGRATION_CREATE_RATE_LIMIT,
  RAPT_INTEGRATION_CREATE_RATE_WINDOW_SECONDS,
  RAPT_INTEGRATION_KIND,
  RAPT_PAYLOAD_TEMPLATE,
  type RaptIntegrationAuth,
  type RaptIntegrationDeleteResult,
  type RaptIntegrationDto
} from "./contracts";

// =============================================================================
//  features/device-streams — integrations.ts (M4, §5 F1-RAPT, §6.2 user_integrations)
//  RAPT-подключение пользователя: одна строка user_integrations на (userId, kind
//  ='rapt'). Токен-паттерн зеркалит service.ts (createRandomToken/hashToken +
//  encryptDeviceToken/decryptDeviceToken, AES-256-GCM) — это ТОТ ЖЕ приём, что
//  ingest-токен стрим-устройств, только ключ владения — userId+kind, а не
//  deviceId. raptTokenStorageDesign (rapt-cloud-provider.ts) — этот файл его
//  и реализует ("encrypted_user_secret").
//
//  Владение файлом (жёсткое разделение с параллельным исполнителем): НЕ трогает
//  service.ts/sessions.ts/ingest.ts/corrections.ts/series.ts — устройства RAPT
//  создаёт и находит ingest-rapt.ts (свой файл), сюда за этим не ходит.
// =============================================================================

type UserIntegrationRow = typeof userIntegrations.$inferSelect;

/** `${APP_URL}/api/ingest/rapt/<rawToken>` — URL вебхука для вставки в RAPT-портал (§5 F1-RAPT). */
const buildRaptWebhookUrl = (rawToken: string): string => {
  const { APP_URL } = getServerEnv();
  return `${APP_URL.replace(/\/+$/, "")}/api/ingest/rapt/${rawToken}`;
};

/** Сгенерировать webhook-токен: raw (в URL) + sha256-хэш (сверка) + AES-256-GCM (повторный показ). */
const generateWebhookToken = (): { rawToken: string; tokenHash: string; tokenEncrypted: string | null } => {
  const rawToken = createRandomToken(32);
  return { rawToken, tokenHash: hashToken(rawToken), tokenEncrypted: encryptDeviceToken(rawToken) };
};

/**
 * Строка → DTO. `rawTokenOverride` — когда мы только что сгенерировали токен
 * сами (create/rotate) и plaintext уже под рукой: строим URL из него напрямую,
 * не расшифровывая только что зашифрованное же значение. Без override — decrypt
 * ingestTokenEncrypted (getRaptIntegration/createOrGet на уже существующей
 * строке); null — ключ шифрования не настроен ИЛИ значение повреждено (webhookUrl
 * тогда null, UI предлагает «Перевыпустите»).
 */
const mapRaptIntegrationRow = (row: UserIntegrationRow, rawTokenOverride?: string): RaptIntegrationDto => {
  const rawToken = rawTokenOverride ?? (row.ingestTokenEncrypted ? decryptDeviceToken(row.ingestTokenEncrypted) : null);
  return {
    id: row.id,
    userId: row.userId,
    webhookUrl: rawToken ? buildRaptWebhookUrl(rawToken) : null,
    payloadTemplate: RAPT_PAYLOAD_TEMPLATE,
    createdAt: row.createdAt
  };
};

const findRaptIntegrationRow = async (userId: string): Promise<UserIntegrationRow | null> => {
  const [row] = await db
    .select()
    .from(userIntegrations)
    .where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.kind, RAPT_INTEGRATION_KIND)));
  return row ?? null;
};

/**
 * Идемпотентно получить/создать RAPT-подключение пользователя (F1-RAPT, шаг 1).
 * Rate limit — ТОЛЬКО на фактическое создание (не на повторный фетч уже
 * существующей строки): экран подключения может открываться многократно и
 * дёргать эту функцию на каждый рендер/поллинг, лимит 5/час на «создание»
 * душил бы обычное открытие страницы, а не абьюз.
 */
export const createOrGetRaptIntegration = async (userId: string): Promise<RaptIntegrationDto> => {
  const existing = await findRaptIntegrationRow(userId);
  if (existing) {
    return mapRaptIntegrationRow(existing);
  }

  await assertRateLimit(userId, "rapt_integration_create", RAPT_INTEGRATION_CREATE_RATE_LIMIT, RAPT_INTEGRATION_CREATE_RATE_WINDOW_SECONDS);

  const { rawToken, tokenHash, tokenEncrypted } = generateWebhookToken();

  const [inserted] = await db
    .insert(userIntegrations)
    .values({ userId, kind: RAPT_INTEGRATION_KIND, ingestTokenHash: tokenHash, ingestTokenEncrypted: tokenEncrypted })
    // Гонка (двойной клик/двойная вкладка) сериализуется уникальным индексом
    // (userId, kind) — конфликт молча ничего не вставляет, ниже перечитываем.
    .onConflictDoNothing({ target: [userIntegrations.userId, userIntegrations.kind] })
    .returning();

  if (inserted) {
    return mapRaptIntegrationRow(inserted, rawToken);
  }

  const race = await findRaptIntegrationRow(userId);
  if (!race) {
    throw new Error("RAPT_INTEGRATION_CREATE_FAILED");
  }
  return mapRaptIntegrationRow(race);
};

export const getRaptIntegration = async (userId: string): Promise<RaptIntegrationDto | null> => {
  const row = await findRaptIntegrationRow(userId);
  return row ? mapRaptIntegrationRow(row) : null;
};

/** «Перевыпустить URL вебхука» (F8): старый токен умирает сразу, новый — из СВЕЖЕГО rawToken. */
export const rotateRaptWebhookToken = async (userId: string): Promise<RaptIntegrationDto> => {
  const { rawToken, tokenHash, tokenEncrypted } = generateWebhookToken();

  const [updated] = await db
    .update(userIntegrations)
    .set({ ingestTokenHash: tokenHash, ingestTokenEncrypted: tokenEncrypted, updatedAt: new Date() })
    .where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.kind, RAPT_INTEGRATION_KIND)))
    .returning();

  if (!updated) {
    throw new Error("NOT_FOUND");
  }
  return mapRaptIntegrationRow(updated, rawToken);
};

/** Число RAPT-устройств пользователя (для сведения в deleteRaptIntegration/UI). */
const countRaptDevices = async (userId: string): Promise<number> => {
  const [row] = await db
    .select({ value: count() })
    .from(brewDevices)
    .where(and(eq(brewDevices.userId, userId), eq(brewDevices.providerId, RAPT_PROVIDER_ID)));
  return row?.value ?? 0;
};

/**
 * Удалить RAPT-подключение целиком (F8 «удалить подключение»). RAPT-устройства
 * пользователя НЕ удаляются (данные ценны — история брожения) — они просто
 * перестанут пополняться новыми точками (вебхук-токен погашен). deviceCount —
 * для тоста-подтверждения («N RAPT-устройств перестанут получать данные»).
 */
export const deleteRaptIntegration = async (userId: string): Promise<RaptIntegrationDeleteResult> => {
  const deviceCount = await countRaptDevices(userId);

  const deleted = await db
    .delete(userIntegrations)
    .where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.kind, RAPT_INTEGRATION_KIND)))
    .returning({ id: userIntegrations.id });

  if (deleted.length === 0) {
    throw new Error("NOT_FOUND");
  }
  return { deviceCount };
};

/**
 * Найти RAPT-подключение по предъявленному вебхук-токену (auth-точка ingest-rapt.ts).
 * Зеркалит findDeviceByToken (features/devices/service.ts): constant-time
 * сравнение хэшей + отсев забаненных/обезличенных владельцев (устройство
 * забаненного пользователя не должно продолжать копить данные через вебхук).
 */
export const findRaptIntegrationByToken = async (rawToken: string): Promise<RaptIntegrationAuth | null> => {
  if (!rawToken) {
    return null;
  }

  const tokenHash = hashToken(rawToken);
  const [row] = await db
    .select({
      id: userIntegrations.id,
      userId: userIntegrations.userId,
      tokenHash: userIntegrations.ingestTokenHash,
      ownerBlockedAt: users.blockedAt,
      ownerAnonymizedAt: users.anonymizedAt
    })
    .from(userIntegrations)
    .innerJoin(users, eq(users.id, userIntegrations.userId))
    .where(eq(userIntegrations.ingestTokenHash, tokenHash));

  if (!row?.tokenHash) {
    return null;
  }

  const stored = Buffer.from(row.tokenHash, "hex");
  const presented = Buffer.from(tokenHash, "hex");
  if (stored.length !== presented.length || !crypto.timingSafeEqual(stored, presented)) {
    return null;
  }

  if (row.ownerBlockedAt !== null || row.ownerAnonymizedAt !== null) {
    return null;
  }

  return { id: row.id, userId: row.userId };
};
