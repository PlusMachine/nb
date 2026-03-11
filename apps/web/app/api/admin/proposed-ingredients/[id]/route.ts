import { NextResponse } from "next/server";

import { applyModerationAction } from "@/features/ingredients/service";
import { requireCatalogRole } from "@/features/ingredients/permissions";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const moderator = await requireCatalogRole("moderator");
    const body = await request.json();
    const { id } = await params;
    const result = await applyModerationAction(id, body, moderator.id);
    return NextResponse.json(result);
  } catch (error) {
    const status = (error as Error).message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}
