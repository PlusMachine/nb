import { NextResponse } from "next/server";

import { createProposedIngredient } from "@/features/ingredients/service";
import { requireUser } from "@/lib/auth";

export async function POST(request: Request) {
  const user = await requireUser();

  try {
    const body = await request.json() as {
      sourceType?: string;
      sourceDisplayName?: string;
      sourcePayload?: Record<string, unknown>;
    };

    if (!body.sourceType?.trim() || !body.sourceDisplayName?.trim()) {
      return NextResponse.json({ error: "Missing proposal payload." }, { status: 400 });
    }

    // Антиспам-барьер (rate limit + квота pending) — внутри createProposedIngredient,
    // единый для этого роута и server action мастера рецептов.
    await createProposedIngredient({
      submittedByUserId: user.id,
      sourceType: body.sourceType.trim(),
      sourceDisplayName: body.sourceDisplayName.trim(),
      sourcePayload: body.sourcePayload ?? {}
    });

    return NextResponse.json({ ok: true, message: "Предложение отправлено в очередь модерации." });
  } catch (error) {
    const message = (error as Error).message;
    if (message === "RATE_LIMITED") {
      return NextResponse.json({ error: "Слишком много предложений подряд. Попробуйте позже." }, { status: 429 });
    }
    if (message === "INGREDIENT_PROPOSAL_QUOTA_REACHED") {
      return NextResponse.json({ error: "Слишком много предложений в очереди модерации. Дождитесь их обработки." }, { status: 429 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
