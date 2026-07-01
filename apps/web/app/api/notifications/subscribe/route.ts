import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { saveSubscription } from "@/features/notifications/service";
import { pushSubscriptionInputSchema } from "@/features/notifications/contracts";

// POST /api/notifications/subscribe — сохранить web-push подписку браузера
// (Phase 6). requireUser; тело — сериализованный PushSubscription. Upsert по
// endpoint (см. service.ts). Пуши шлёт always-on мост через @nb/push.
export async function POST(request: Request) {
  const user = await requireUser();
  try {
    const parsed = pushSubscriptionInputSchema.parse(await request.json());
    await saveSubscription(user.id, parsed);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "INVALID_SUBSCRIPTION" }, { status: 400 });
  }
}
