import { AdminFilterTabs, type AdminFilterTab } from "@/components/admin/admin-filter-tabs";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminRecipesList } from "@/components/admin/recipes/admin-recipes-list";
import { AdminRecipesToolbar } from "@/components/admin/recipes/admin-recipes-toolbar";
import {
  adminRecipePageSizeOptions,
  adminRecipeStatusFilterLabels,
  adminRecipeStatusFilters,
  buildAdminRecipesHref,
  parseAdminRecipesQuery
} from "@/features/recipes/admin-page-model";
import { listAdminRecipes } from "@/features/recipes/admin-service";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminRecipesPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("moderator");

  const query = parseAdminRecipesQuery(await searchParams);
  const result = await listAdminRecipes(query);

  const tabs: AdminFilterTab[] = adminRecipeStatusFilters.map((status) => ({
    key: status,
    label: adminRecipeStatusFilterLabels[status],
    href: buildAdminRecipesHref(query, { status }),
    count: result.counts[status]
  }));

  return (
    <section className="space-y-4">
      <AdminPageHeader title="Рецепты" />

      <AdminFilterTabs tabs={tabs} activeKey={query.status} label="Статус" />

      <AdminRecipesToolbar query={query} />

      <AdminRecipesList items={result.items} />

      <AdminPagination
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        pageSize={result.pageSize}
        pageSizeOptions={adminRecipePageSizeOptions}
      />
    </section>
  );
}
