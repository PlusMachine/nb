import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCatalogRole } from "@/features/ingredients/permissions";
import { invalidateIngredientsCatalogCache, mergeDuplicateIngredients } from "@/features/ingredients/service";

const mergeSchema = z.object({
  sourceIngredientId: z.string().trim().min(1),
  targetIngredientId: z.string().trim().min(1),
  note: z.string().trim().max(1000).optional()
});

export async function POST(request: Request) {
  try {
    const actor = await requireCatalogRole("moderator");
    const body = mergeSchema.parse(await request.json());
    const result = await mergeDuplicateIngredients(body.sourceIngredientId, body.targetIngredientId, actor.id, body.note);
    invalidateIngredientsCatalogCache();
    return NextResponse.json(result);
  } catch (error) {
    const status = (error as Error).message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}
