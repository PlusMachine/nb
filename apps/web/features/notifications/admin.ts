import { z } from "zod";
import { db, desc, eq, pushSubscriptions, users } from "@nb/db";

// =============================================================================
//  features/notifications/admin.ts — обзор web-push подписок для /admin/push.
//  Только чтение и удаление протухшей подписки: рассылка пушей отсюда не идёт
//  (её делает мост через @nb/push по событиям варки).
// =============================================================================

export type PushSubscriptionAdminRow = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  browser: string;
  platform: string;
  /** Хост push-сервиса из endpoint: по нему видно, чей это браузер на самом деле. */
  service: string;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type PushSubscriptionsOverview = {
  items: PushSubscriptionAdminRow[];
  total: number;
  userCount: number;
  /** Подписки с ошибками доставки — кандидаты на удаление. */
  failingCount: number;
  browsers: Array<{ label: string; count: number }>;
};

const UNKNOWN_LABEL = "—";

/** Браузер по user-agent. Порядок проверок важен: Edge/Opera/Яндекс тоже содержат "Chrome". */
export const resolvePushBrowser = (userAgent: string | null): string => {
  if (!userAgent) {
    return UNKNOWN_LABEL;
  }

  if (/YaBrowser/i.test(userAgent)) {
    return "Яндекс.Браузер";
  }
  if (/Edg\//i.test(userAgent)) {
    return "Edge";
  }
  if (/OPR\/|Opera/i.test(userAgent)) {
    return "Opera";
  }
  if (/Firefox\//i.test(userAgent)) {
    return "Firefox";
  }
  if (/Chrome\//i.test(userAgent)) {
    return "Chrome";
  }
  if (/Safari\//i.test(userAgent)) {
    return "Safari";
  }

  return UNKNOWN_LABEL;
};

/** Платформа по user-agent. iPadOS отдаёт «Macintosh», поэтому iPad ловим отдельно. */
export const resolvePushPlatform = (userAgent: string | null): string => {
  if (!userAgent) {
    return UNKNOWN_LABEL;
  }

  if (/Android/i.test(userAgent)) {
    return "Android";
  }
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return "iOS";
  }
  if (/Windows/i.test(userAgent)) {
    return "Windows";
  }
  if (/Macintosh|Mac OS X/i.test(userAgent)) {
    return "macOS";
  }
  if (/Linux/i.test(userAgent)) {
    return "Linux";
  }

  return UNKNOWN_LABEL;
};

/** Хост push-сервиса из endpoint (fcm.googleapis.com, web.push.apple.com и т.п.). */
export const resolvePushService = (endpoint: string): string => {
  try {
    return new URL(endpoint).host;
  } catch {
    return UNKNOWN_LABEL;
  }
};

export const listPushSubscriptions = async (): Promise<PushSubscriptionsOverview> => {
  const rows = await db
    .select({
      id: pushSubscriptions.id,
      userId: pushSubscriptions.userId,
      endpoint: pushSubscriptions.endpoint,
      userAgent: pushSubscriptions.userAgent,
      failureCount: pushSubscriptions.failureCount,
      createdAt: pushSubscriptions.createdAt,
      updatedAt: pushSubscriptions.updatedAt,
      displayName: users.displayName,
      email: users.email,
      anonymizedAt: users.anonymizedAt
    })
    .from(pushSubscriptions)
    .innerJoin(users, eq(users.id, pushSubscriptions.userId))
    .orderBy(desc(pushSubscriptions.createdAt));

  const items: PushSubscriptionAdminRow[] = rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    userName: row.displayName,
    // У обезличенного аккаунта ПДн затёрты — e-mail не показываем даже из БД.
    userEmail: row.anonymizedAt ? null : row.email,
    browser: resolvePushBrowser(row.userAgent),
    platform: resolvePushPlatform(row.userAgent),
    service: resolvePushService(row.endpoint),
    failureCount: row.failureCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));

  const browserCounts = new Map<string, number>();
  for (const item of items) {
    browserCounts.set(item.browser, (browserCounts.get(item.browser) ?? 0) + 1);
  }

  return {
    items,
    total: items.length,
    userCount: new Set(items.map((item) => item.userId)).size,
    failingCount: items.filter((item) => item.failureCount > 0).length,
    browsers: [...browserCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ru"))
  };
};

export const deletePushSubscriptionById = async (subscriptionId: string): Promise<void> => {
  // Не-uuid иначе долетает до Postgres как 22P02 → 500 вместо «не найдено».
  if (!z.string().uuid().safeParse(subscriptionId).success) {
    throw new Error("NOT_FOUND");
  }

  const [deleted] = await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.id, subscriptionId))
    .returning({ id: pushSubscriptions.id });

  if (!deleted) {
    throw new Error("NOT_FOUND");
  }
};
