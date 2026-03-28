import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { searchUserCatalogIngredients } from "@/features/ingredients/catalog-service";

export async function GET(request: Request) {
  const user = await requireUser();
  const { searchParams } = new URL(request.url);

  try {
    const items = await searchUserCatalogIngredients(user.id, {
      q: searchParams.get("q") ?? "",
      type: searchParams.get("type") ?? undefined,
      category: searchParams.get("category") ?? undefined,
      subtype: searchParams.get("subtype") ?? undefined,
      limit: Number(searchParams.get("limit") ?? "10"),
      includeCustom: searchParams.get("includeCustom") !== "false"
    });

    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
