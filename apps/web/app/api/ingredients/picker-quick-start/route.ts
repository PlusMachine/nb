import { NextResponse } from "next/server";

import { listIngredientPickerQuickStart } from "@/features/ingredients/catalog-service";
import type { IngredientCategory, UserIngredientReference } from "@/features/ingredients/contracts";
import { requireUser } from "@/lib/auth";

export async function POST(request: Request) {
  const user = await requireUser();

  try {
    const body = await request.json() as {
      category?: string;
      subtype?: string | null;
      recentReferences?: unknown[];
      recentLimit?: number;
    };
    const result = await listIngredientPickerQuickStart(user.id, {
      category: body.category as IngredientCategory,
      subtype: body.subtype === "malt" || body.subtype === "fermentable" ? body.subtype : null,
      recentReferences: Array.isArray(body.recentReferences) ? body.recentReferences as UserIngredientReference[] : undefined,
      recentLimit: body.recentLimit
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
