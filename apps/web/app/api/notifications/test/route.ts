import { assertRateLimit } from "@nb/auth";
import { NextResponse } from "next/server";

import { sendPushToUser } from "@nb/push";

import { requireUser } from "@/lib/auth";

// POST /api/notifications/test — отправить тест-пуш себе (проверка пайплайна без
// полного MQTT-стека, Phase 6). requireUser; шлёт на все подписки пользователя.
export async function POST() {
  const user = await requireUser();

  // Каждый вызов шлёт пуш на все подписки — лимитируем, чтобы не жечь VAPID-квоту.
  try {
    await assertRateLimit(user.id, "notification_test", 10, 10 * 60);
  } catch {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const sent = await sendPushToUser(user.id, {
    title: "BrewForge",
    body: "Уведомления подключены. Так вы узнаете о засыпи, промывке и авариях.",
    tag: "test",
    url: "/app/devices"
  });
  return NextResponse.json({ ok: true, sent });
}
