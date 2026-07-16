import { NextResponse, type NextRequest } from "next/server";

import { exitDevGuestPreview, isDevAutoAuthEnabled, setDevAccount } from "@/lib/auth";

/**
 * Dev-only: выйти из гостевого просмотра и вернуться в dev-аккаунт.
 * Тело { email } переключает на конкретный аккаунт из списка автологина;
 * без тела — возврат в текущий активный аккаунт. Вне dev-автологина недоступно.
 */
export async function POST(request: NextRequest) {
  if (!isDevAutoAuthEnabled) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  const email = await request
    .json()
    .then((body: unknown) => (body && typeof body === "object" && "email" in body ? String((body as { email: unknown }).email) : undefined))
    .catch(() => undefined);
  if (email) {
    await setDevAccount(email);
  } else {
    await exitDevGuestPreview();
  }
  return NextResponse.json({ ok: true });
}
