import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { feedbackInputSchema } from "@/features/feedback/contracts";
import { checkFeedbackRateLimit } from "@/features/feedback/rate-limit";
import { createFeedback } from "@/features/feedback/service";
import { getSessionUser } from "@/lib/auth";

const clientKey = (request: Request, userId?: string): string => {
  if (userId) {
    return `user:${userId}`;
  }
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return `ip:${ip}`;
};

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  // Honeypot: боты заполняют скрытое поле `website`. Отвечаем «ок», ничего не пишем.
  if (raw && typeof raw === "object" && typeof (raw as { website?: unknown }).website === "string") {
    if ((raw as { website: string }).website.trim().length > 0) {
      return NextResponse.json({ ok: true, message: "Спасибо! Мы получили ваше сообщение." });
    }
  }

  try {
    const input = feedbackInputSchema.parse(raw);
    const user = await getSessionUser();

    if (!checkFeedbackRateLimit(clientKey(request, user?.id))) {
      return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
    }

    await createFeedback(input, {
      submittedByUserId: user?.id ?? null,
      userAgent: request.headers.get("user-agent")
    });

    return NextResponse.json({ ok: true, message: "Спасибо! Мы получили ваше сообщение." });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "INVALID_INPUT" }, { status: 400 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
