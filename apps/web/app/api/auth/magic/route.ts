import { NextResponse } from "next/server";

import { consumeMagicLink, startMagicLink } from "@/lib/auth";
import { verifyCaptchaHook } from "@/lib/anti-abuse";

export async function POST(request: Request) {
  const body = await request.json();

  if (!(await verifyCaptchaHook(body.captchaToken))) {
    return NextResponse.json({ error: "captcha_required" }, { status: 400 });
  }

  try {
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
