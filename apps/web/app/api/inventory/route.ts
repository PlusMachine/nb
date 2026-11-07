import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { inventoryListQuerySchema } from "@/features/inventory/contracts";
import { getInventorySummaries, listInventoryForUserWithMeta } from "@/features/inventory/service";
import { findBrewableRecipesForUser } from "@/features/recipes/match-service";
import { inventoryFiltersHref, inventoryServiceQuery, parseInventoryFilters } from "@/features/inventory/query";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers });
    const filters = parseInventoryFilters(Object.fromEntries(new URL(request.url).searchParams));
    const query = inventoryServiceQuery(filters);
    if (!inventoryListQuerySchema.safeParse(query).success) {
      return NextResponse.json({ error: "INVALID_QUERY" }, { status: 400, headers });
    }
    const [result, summary] = await Promise.all([
      listInventoryForUserWithMeta(user.id, query), getInventorySummaries(user.id)
    ]);
    const narrowed = Boolean(filters.search || filters.category || filters.subtype || filters.group);
    const brewableRecipes = !narrowed && summary.inStockItems > 0
      ? await findBrewableRecipesForUser({ userId: user.id, limit: 6 }).catch(() => [])
      : [];
    return NextResponse.json({ ...result, summary, brewableRecipes, filters, key: inventoryFiltersHref(filters) }, { headers });
  } catch {
    return NextResponse.json({ error: "INVENTORY_FETCH_FAILED" }, { status: 500, headers });
  }
}
