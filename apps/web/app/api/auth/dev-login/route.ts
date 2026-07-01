import { NextResponse } from "next/server";

import { exitDevGuestPreview, isDevAutoAuthEnabled } from "@/lib/auth";

/**
 * Dev-only: выйти из гостевого просмотра и вернуться в аккаунт DEV_AUTH_EMAIL.
 * Вне dev-автологина (в т.ч. в production) — недоступно.
 */
export async function POST() {
  if (!isDevAutoAuthEnabled) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  await exitDevGuestPreview();
  return NextResponse.json({ ok: true });
}
