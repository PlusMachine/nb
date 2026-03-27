import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { searchCatalogItems } from "@/features/ingredients/service";

export async function GET(request: Request) {
  await requireUser();
  const { searchParams } = new URL(request.url);

  try {
    const items = await searchCatalogItems({
      q: searchParams.get("q") ?? "",
      type: searchParams.get("type") ?? undefined,
      category: searchParams.get("category") ?? undefined,
      limit: Number(searchParams.get("limit") ?? "10")
    });

    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
