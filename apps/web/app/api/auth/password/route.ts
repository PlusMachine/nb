import { NextResponse } from "next/server";
import { z } from "zod";

import { passwordLogin, passwordSignup, requestPasswordReset, resetPassword } from "@/lib/auth";
import { assertIpRateLimit, clientIpFrom, verifyCaptchaHook } from "@/lib/anti-abuse";

const passwordRequestSchema = z.object({
  action: z.enum(["login", "signup", "request-reset", "reset"]),
  email: z.string().trim().email().max(320),
  password: z.string().max(256).optional(),
  token: z.string().max(128).optional(),
  consent: z.boolean().optional(),
  captchaToken: z.string().max(8192).nullish()
});

export async function POST(request: Request) {
  const parsed = passwordRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
  const body = parsed.data;

  if (!(await verifyCaptchaHook(body.captchaToken, clientIpFrom(request)))) {
    return NextResponse.json({ error: "captcha_required" }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "login":
        // Per-IP анти-brute-force (общий счётчик auth_attempt с verify-действиями);
        // per-email лимит — внутри passwordLogin.
        await assertIpRateLimit(request, "auth_attempt", 30, 10 * 60);
        await passwordLogin(body.email, body.password ?? "");
        return NextResponse.json({ ok: true });
      case "signup":
        // Per-IP лимит от массовой регистрации аккаунтов.
        await assertIpRateLimit(request, "auth_attempt", 30, 10 * 60);
        // Согласие на обработку ПДн (152-ФЗ) обязательно при создании аккаунта.
        if (body.consent !== true) {
          return NextResponse.json({ error: "consent_required" }, { status: 400 });
        }
        await passwordSignup(body.email, body.password ?? "", true);
        return NextResponse.json({ ok: true });
      case "request-reset":
        await assertIpRateLimit(request, "auth_send", 15, 60 * 60);
        await requestPasswordReset(body.email);
        return NextResponse.json({ ok: true });
      case "reset":
        await assertIpRateLimit(request, "auth_attempt", 30, 10 * 60);
        await resetPassword(body.email, body.token ?? "", body.password ?? "");
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: "invalid_action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "unknown_error" }, { status: 400 });
  }
}
