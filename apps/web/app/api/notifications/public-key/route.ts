import { NextResponse } from "next/server";

// GET /api/notifications/public-key — публичный VAPID-ключ для подписки браузера
// (Phase 6). Значение публичное по дизайну web-push; единый источник — серверный
// env (ротация без ребилда). Пусто, если пуши не настроены (клиент скроет opt-in).
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null });
}
