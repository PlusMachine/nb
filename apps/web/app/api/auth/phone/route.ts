import { NextResponse } from "next/server";

import { startPhoneOtp, verifyPhoneOtp } from "@/lib/auth";
import { assertIpRateLimit, clientIpFrom, verifyCaptchaHook } from "@/lib/anti-abuse";

export async function POST(request: Request) {
  const body = await request.json();
  const action = body.action as "request" | "verify";

  if (!(await verifyCaptchaHook(body.captchaToken, clientIpFrom(request)))) {
    return NextResponse.json({ error: "captcha_required" }, { status: 400 });
  }

  try {
    if (action === "request") {
      // Per-IP лимит поверх лимита «5 на номер»: SMS платные, бот с перебором
      // НОМЕРОВ иначе сжигает SMS-бюджет, не упираясь в per-phone лимит.
      await assertIpRateLimit(request, "auth_send", 15, 60 * 60);
      // Согласие на обработку ПДн (152-ФЗ) обязательно ДО первой обработки номера:
      // на этом шаге телефон сохраняется и на него уходит SMS.
      if (body.consent !== true) {
        return NextResponse.json({ error: "consent_required" }, { status: 400 });
      }
      await startPhoneOtp(String(body.phone ?? ""));
      return NextResponse.json({ ok: true });
    }

    if (action === "verify") {
      await assertIpRateLimit(request, "auth_attempt", 30, 10 * 60);
      await verifyPhoneOtp(String(body.phone ?? ""), String(body.code ?? ""), body.consent === true);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "unknown_error" }, { status: 400 });
  }
}
