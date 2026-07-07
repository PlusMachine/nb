import { NextResponse } from "next/server";

import { consumeMagicLink, startMagicLink } from "@/lib/auth";
import { assertIpRateLimit, clientIpFrom, verifyCaptchaHook } from "@/lib/anti-abuse";

export async function POST(request: Request) {
  const body = await request.json();

  if (!(await verifyCaptchaHook(body.captchaToken, clientIpFrom(request)))) {
    return NextResponse.json({ error: "captcha_required" }, { status: 400 });
  }

  try {
    // Per-IP лимит (общий счётчик auth_send со всеми send-действиями auth-флоу).
    await assertIpRateLimit(request, "auth_send", 15, 60 * 60);
    // Согласие на обработку ПДн (152-ФЗ) обязательно до отправки ссылки на e-mail.
    if (body.consent !== true) {
      return NextResponse.json({ error: "consent_required" }, { status: 400 });
    }
    await startMagicLink(String(body.email ?? ""));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "unknown_error" }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    await consumeMagicLink(String(searchParams.get("email") ?? ""), String(searchParams.get("token") ?? ""));
    return NextResponse.redirect(new URL("/app", request.url));
  } catch {
    return NextResponse.redirect(new URL("/login?error=magic_link", request.url));
  }
}
