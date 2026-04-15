import { NextResponse } from "next/server";

import { searchInventorySuggestions } from "@/features/inventory/service";
import { requireUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await requireUser();
  const { searchParams } = new URL(request.url);

  try {
    const items = await searchInventorySuggestions(user.id, {
      q: searchParams.get("q") ?? "",
      category: searchParams.get("category") ?? undefined,
      subtype: searchParams.get("subtype") ?? undefined,
      type: searchParams.get("type") ?? undefined,
      limit: Number(searchParams.get("limit") ?? "10"),
      includeEmpty: searchParams.get("finished") === "true",
      stockState: searchParams.get("stock") === "empty"
        ? "empty"
        : searchParams.get("stock") === "in_stock"
          ? "in_stock"
          : "all",
      includeArchived: searchParams.get("archived") === "true",
      dedupeSource: searchParams.get("dedupe") !== "false"
    }, {
      preferredCurrency: user.preferredCurrency
    });

    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
