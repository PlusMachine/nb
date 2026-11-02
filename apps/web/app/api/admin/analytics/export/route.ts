import { getSessionUser } from "@/lib/auth";
import { parseAnalyticsRange } from "@/features/product-analytics/contracts";
import { getAnalyticsOverview } from "@/features/product-analytics/service";
import { exportAnalyticsCsv } from "@/features/product-analytics/export";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return Response.json({ error: "FORBIDDEN" }, { status: user ? 403 : 401 });
  const range = parseAnalyticsRange(Object.fromEntries(new URL(request.url).searchParams));
  return new Response(exportAnalyticsCsv(await getAnalyticsOverview(range)), { headers: {
    "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="analytics-${range.from}-${range.to}.csv"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"
  } });
}
