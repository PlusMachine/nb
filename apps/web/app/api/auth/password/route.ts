import { NextResponse } from "next/server";

import { passwordLogin, passwordSignup, requestPasswordReset, resetPassword } from "@/lib/auth";
import { assertIpRateLimit, clientIpFrom, verifyCaptchaHook } from "@/lib/anti-abuse";

export async function POST(request: Request) {
  const body = await request.json();

  if (!(await verifyCaptchaHook(body.captchaToken, clientIpFrom(request)))) {
    return NextResponse.json({ error: "captcha_required" }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "login":
        // Per-IP анти-brute-force (общий счётчик auth_attempt с verify-действиями);
        // per-email лимит — внутри passwordLogin.
        await assertIpRateLimit(request, "auth_attempt", 30, 10 * 60);
        await passwordLogin(String(body.email ?? ""), String(body.password ?? ""));
        return NextResponse.json({ ok: true });
      case "signup":
        // Per-IP лимит от массовой регистрации аккаунтов.
        await assertIpRateLimit(request, "auth_attempt", 30, 10 * 60);
        // Согласие на обработку ПДн (152-ФЗ) обязательно при создании аккаунта.
        if (body.consent !== true) {
          return NextResponse.json({ error: "consent_required" }, { status: 400 });
        }
        await passwordSignup(String(body.email ?? ""), String(body.password ?? ""), true);
        return NextResponse.json({ ok: true });
      case "request-reset":
        await assertIpRateLimit(request, "auth_send", 15, 60 * 60);
        await requestPasswordReset(String(body.email ?? ""));
        return NextResponse.json({ ok: true });
      case "reset":
        await assertIpRateLimit(request, "auth_attempt", 30, 10 * 60);
        await resetPassword(String(body.email ?? ""), String(body.token ?? ""), String(body.password ?? ""));
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: "invalid_action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "unknown_error" }, { status: 400 });
  }
}
