import { NextResponse } from "next/server";

import { passwordLogin, passwordSignup, requestPasswordReset, resetPassword } from "@/lib/auth";
import { verifyCaptchaHook } from "@/lib/anti-abuse";

export async function POST(request: Request) {
  const body = await request.json();

  if (!(await verifyCaptchaHook(body.captchaToken))) {
    return NextResponse.json({ error: "captcha_required" }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "login":
        await passwordLogin(String(body.email ?? ""), String(body.password ?? ""));
        return NextResponse.json({ ok: true });
      case "signup":
        // Согласие на обработку ПДн (152-ФЗ) обязательно при создании аккаунта.
        if (body.consent !== true) {
          return NextResponse.json({ error: "consent_required" }, { status: 400 });
        }
        await passwordSignup(String(body.email ?? ""), String(body.password ?? ""), true);
        return NextResponse.json({ ok: true });
      case "request-reset":
        await requestPasswordReset(String(body.email ?? ""));
        return NextResponse.json({ ok: true });
      case "reset":
        await resetPassword(String(body.email ?? ""), String(body.token ?? ""), String(body.password ?? ""));
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: "invalid_action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "unknown_error" }, { status: 400 });
  }
}
