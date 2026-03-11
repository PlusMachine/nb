import { NextResponse } from "next/server";

import { listProposedIngredients } from "@/features/ingredients/service";
import { requireCatalogRole } from "@/features/ingredients/permissions";

export async function GET(request: Request) {
  try {
    await requireCatalogRole("moderator");
    const { searchParams } = new URL(request.url);
    const status = (searchParams.get("status") as "pending" | "approved" | "rejected" | "merged" | null) ?? "pending";
    const items = await listProposedIngredients(status);
    return NextResponse.json({ items });
  } catch (error) {
    const status = (error as Error).message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}
