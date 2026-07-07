import { NextResponse } from "next/server";

import { createProposedIngredient } from "@/features/ingredients/service";
import { requireUser } from "@/lib/auth";
import { assertRateLimit } from "@nb/auth";

export async function POST(request: Request) {
  const user = await requireUser();

  // Антиспам: предложения попадают в очередь модерации — не даём её завалить.
  try {
    await assertRateLimit(user.id, "ingredient_proposal", 10, 60 * 60);
  } catch {
    return NextResponse.json({ error: "Слишком много предложений подряд. Попробуйте позже." }, { status: 429 });
  }

  try {
    const body = await request.json() as {
      sourceType?: string;
      sourceDisplayName?: string;
      sourcePayload?: Record<string, unknown>;
    };

    if (!body.sourceType?.trim() || !body.sourceDisplayName?.trim()) {
      return NextResponse.json({ error: "Missing proposal payload." }, { status: 400 });
    }

    await createProposedIngredient({
      submittedByUserId: user.id,
      sourceType: body.sourceType.trim(),
      sourceDisplayName: body.sourceDisplayName.trim(),
      sourcePayload: body.sourcePayload ?? {}
    });

    return NextResponse.json({ ok: true, message: "Предложение отправлено в очередь модерации." });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
