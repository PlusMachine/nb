import { AnalyticsDashboard } from "@/components/admin/analytics/analytics-dashboard";
import { parseAnalyticsRange } from "@/features/product-analytics/contracts";
import { getAnalyticsOverview } from "@/features/product-analytics/service";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole("admin");
  const params = Object.fromEntries(Object.entries(await searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  return <AnalyticsDashboard data={await getAnalyticsOverview(parseAnalyticsRange(params))} />;
}
