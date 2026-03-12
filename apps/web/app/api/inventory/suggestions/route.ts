import { NextResponse } from "next/server";

import { searchInventorySuggestions } from "@/features/inventory/service";
import { requireUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await requireUser();
  const { searchParams } = new URL(request.url);

  try {
    const items = await searchInventorySuggestions(user.id, {
      q: searchParams.get("q") ?? "",
      type: searchParams.get("type") ?? undefined,
      limit: Number(searchParams.get("limit") ?? "10"),
      includeArchived: searchParams.get("archived") === "true"
    });

    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
