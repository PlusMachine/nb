import { NextResponse } from "next/server";

import { startEmailOtp, verifyEmailOtp } from "@/lib/auth";
import { assertIpRateLimit, clientIpFrom, verifyCaptchaHook } from "@/lib/anti-abuse";

export async function POST(request: Request) {
  const body = await request.json();
  const action = body.action as "request" | "verify";

  if (!(await verifyCaptchaHook(body.captchaToken, clientIpFrom(request)))) {
    return NextResponse.json({ error: "captcha_required" }, { status: 400 });
  }

  try {
    if (action === "request") {
      // Per-IP лимит поверх лимита «5 на адрес» — от рассылки кодов по перебору адресов.
      await assertIpRateLimit(request, "auth_send", 15, 60 * 60);
      // Согласие на обработку ПДн (152-ФЗ) обязательно ДО первой обработки e-mail:
      // на этом шаге адрес сохраняется и на него уходит код.
      if (body.consent !== true) {
        return NextResponse.json({ error: "consent_required" }, { status: 400 });
      }
      await startEmailOtp(String(body.email ?? ""));
      return NextResponse.json({ ok: true });
    }

    if (action === "verify") {
      await assertIpRateLimit(request, "auth_attempt", 30, 10 * 60);
      await verifyEmailOtp(String(body.email ?? ""), String(body.code ?? ""), body.consent === true);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "unknown_error" }, { status: 400 });
  }
}
