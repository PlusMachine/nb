import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { hasSubscription } from "@/features/notifications/service";

// GET /api/notifications/subscription?endpoint=… — знает ли сервер подписку этого
// браузера. Источник истины для тумблера: браузерный PushSubscription переживает
// удаление строки в БД (её сносит блокировка аккаунта), и без строки пуши не
// уходят. Без endpoint — «есть ли хоть одна подписка у пользователя».
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await requireUser();
  const endpoint = new URL(request.url).searchParams.get("endpoint");
  const subscribed = await hasSubscription(user.id, endpoint ?? undefined);
  return NextResponse.json({ subscribed });
}
