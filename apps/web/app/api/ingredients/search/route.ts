import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { searchUserCatalogIngredients } from "@/features/ingredients/catalog-service";

export async function GET(request: Request) {
  const user = await requireUser();
  const { searchParams } = new URL(request.url);

  try {
    const result = await searchUserCatalogIngredients(user.id, {
      q: searchParams.get("q") ?? "",
      type: searchParams.get("type") ?? undefined,
      category: searchParams.get("category") ?? undefined,
      subtype: searchParams.get("subtype") ?? undefined,
      family: searchParams.get("family") ?? undefined,
      group: searchParams.get("group") ?? undefined,
      manufacturer: searchParams.get("manufacturer") ?? undefined,
      favoritesOnly: searchParams.get("favoritesOnly") === "true",
      customOnly: searchParams.get("customOnly") === "true",
      limit: Number(searchParams.get("limit") ?? "10"),
      includeCustom: searchParams.get("includeCustom") !== "false"
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
