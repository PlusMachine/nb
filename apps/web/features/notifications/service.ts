// =============================================================================
//  features/notifications/service.ts
//  CRUD web-push подписок (Phase 6). Владение — по userId. Upsert по endpoint:
//  один браузер = один endpoint; при повторной подписке/смене логина в браузере
//  endpoint «переезжает» к текущему пользователю (обновляются ключи и владелец).
//  Отправку пушей делает мост через @nb/push (здесь — только управление списком).
// =============================================================================
import { and, db, eq, pushSubscriptions } from "@nb/db";

import type { PushSubscriptionInput } from "./contracts";

/** Сохранить/обновить подписку браузера пользователя (upsert по endpoint). */
export async function saveSubscription(
  userId: string,
  input: PushSubscriptionInput
): Promise<void> {
  const now = new Date();
  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: input.userAgent ?? null
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent ?? null,
        failureCount: 0,
        updatedAt: now
      }
    });
}

/** Удалить подписку пользователя по endpoint (только свою). */
export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

/** Есть ли у пользователя хотя бы одна активная подписка (для UI-состояния). */
export async function hasSubscription(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .limit(1);
  return Boolean(row);
}
