import { NextResponse } from "next/server";

import { sendPushToUser } from "@nb/push";

import { requireUser } from "@/lib/auth";

// POST /api/notifications/test — отправить тест-пуш себе (проверка пайплайна без
// полного MQTT-стека, Phase 6). requireUser; шлёт на все подписки пользователя.
export async function POST() {
  const user = await requireUser();
  const sent = await sendPushToUser(user.id, {
    title: "BrewForge",
    body: "Уведомления подключены. Так вы узнаете о засыпи, промывке и авариях.",
    tag: "test",
    url: "/app/devices"
  });
  return NextResponse.json({ ok: true, sent });
}
