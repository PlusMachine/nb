import { NextResponse } from "next/server";

import { startEmailOtp, verifyEmailOtp } from "@/lib/auth";
import { verifyCaptchaHook } from "@/lib/anti-abuse";

export async function POST(request: Request) {
  const body = await request.json();
  const action = body.action as "request" | "verify";

  if (!(await verifyCaptchaHook(body.captchaToken))) {
    return NextResponse.json({ error: "captcha_required" }, { status: 400 });
  }

  try {
    if (action === "request") {
      await startEmailOtp(String(body.email ?? ""));
      return NextResponse.json({ ok: true });
    }

    if (action === "verify") {
      await verifyEmailOtp(String(body.email ?? ""), String(body.code ?? ""));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "unknown_error" }, { status: 400 });
  }
}
