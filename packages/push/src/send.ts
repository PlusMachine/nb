// =============================================================================
//  @nb/push — send.ts
//  Отправка web-push (VAPID) подписчикам пользователя. ЕДИНСТВЕННОЕ место с
//  зависимостью `web-push`; сервер-only (импортит @nb/db). Диспетчер — мост
//  (always-on консьюмер, Phase 6), опц. — тест-роут портала.
//
//  Безопасность/устойчивость: VAPID-ключи из env (приватный — секрет). Мёртвые
//  подписки (404/410 от push-сервиса) удаляются; прочие ошибки логируются, но не
//  роняют вызывающего (мост никогда не падает из-за пуша).
// =============================================================================
import webpush from "web-push";
import { db, eq, pushSubscriptions } from "@nb/db";

import type { PushPayload } from "./notification.js";

let vapidConfigured = false;

/** Настроить VAPID из env один раз. false — ключи не заданы (пуши пропускаются). */
function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@localhost";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

/** Заданы ли VAPID-ключи (для диагностики/health). */
export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/**
 * Отправить payload всем web-push-подписчикам пользователя. Возвращает число
 * успешно доставленных. Мёртвые подписки (404/410) удаляются из БД. Никогда не
 * бросает — best-effort (безопасность варки не зависит от доставки пуша).
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!ensureVapid()) {
    console.warn("[push] VAPID не настроен (VAPID_PUBLIC_KEY/PRIVATE_KEY) — пуш пропущен");
    return 0;
  }

  let subs: { id: string; endpoint: string; p256dh: string; auth: string }[] = [];
  try {
    subs = await db
      .select({
        id: pushSubscriptions.id,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
  } catch (err) {
    console.error("[push] не удалось прочитать подписки:", (err as Error).message);
    return 0;
  }

  const body = JSON.stringify(payload);
  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
      );
      sent += 1;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Подписка мертва (endpoint отозван push-сервисом) — вычищаем.
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id)).catch(() => {});
      } else {
        console.error("[push] ошибка отправки:", (err as Error).message);
      }
    }
  }
  return sent;
}
