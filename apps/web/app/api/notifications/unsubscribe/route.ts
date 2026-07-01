import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { removeSubscription } from "@/features/notifications/service";
import { pushUnsubscribeSchema } from "@/features/notifications/contracts";

// POST /api/notifications/unsubscribe — удалить web-push подписку пользователя по
// endpoint (Phase 6). requireUser; удаляется только своя подписка.
export async function POST(request: Request) {
  const user = await requireUser();
  try {
    const { endpoint } = pushUnsubscribeSchema.parse(await request.json());
    await removeSubscription(user.id, endpoint);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
}
