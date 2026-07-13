import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { assertRateLimit } from "@nb/auth";

import { feedbackInputSchema } from "@/features/feedback/contracts";
import { createFeedback } from "@/features/feedback/service";
import { clientIpFrom } from "@/lib/anti-abuse";
import { getSessionUser } from "@/lib/auth";

// Ключ лимита: залогиненный — по юзеру, аноним — по устойчивому к подделке IP
// (clientIpFrom учитывает доверенные прокси-хопы; null → общий ключ "unknown").
const clientKey = (request: Request, userId?: string): string =>
  userId ? `user:${userId}` : `ip:${clientIpFrom(request) ?? "unknown"}`;

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

    try {
      await assertRateLimit(clientKey(request, user?.id), "feedback_submit", 5, 10 * 60);
    } catch {
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
