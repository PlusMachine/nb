import Link from "next/link";
import { ArrowRightLeft, Plus, ShieldAlert } from "lucide-react";

import { Badge } from "@nb/ui";
import { AdminFilterTabs, type AdminFilterTab } from "@/components/admin/admin-filter-tabs";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminCatalogList } from "@/components/ingredients/admin-catalog-list";
import { AdminCatalogToolbar } from "@/components/ingredients/admin-catalog-toolbar";
import {
  buildAdminIngredientsHref,
  ingredientCatalogCategoryOrder,
  ingredientCatalogStatusLabels,
  ingredientCatalogStatuses,
  parseAdminIngredientsPageParams
} from "@/features/ingredients/admin-page-model";
import { ingredientCategoryLabels } from "@/features/ingredients/presentation";
import { listCatalogIngredients } from "@/features/ingredients/service";
import { requireRole } from "@/lib/auth";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const basePath = "/admin/ingredients";

export default async function AdminIngredientsPage({ searchParams }: Props) {
  await requireRole("admin");

  const params = parseAdminIngredientsPageParams(await searchParams);
  const { q, category, status, sort, page, pageSize } = params;

  const result = await listCatalogIngredients({
    page,
    pageSize,
    q: q || undefined,
    category,
    status,
    sort
  });

  const categoryTabs: AdminFilterTab[] = [
    {
      key: "all",
      label: "Все",
      href: buildAdminIngredientsHref(basePath, { q, status: status ?? "all", sort, pageSize }),
      count: Object.values(result.facets.byCategory).reduce((sum, count) => sum + count, 0)
    },
    ...ingredientCatalogCategoryOrder.map((item) => ({
      key: item,
      label: ingredientCategoryLabels[item],
      href: buildAdminIngredientsHref(basePath, {
        q,
        category: item,
        status: status ?? "all",
        sort,
        pageSize
      }),
      count: result.facets.byCategory[item]
    }))
  ];

  const statusTabs: AdminFilterTab[] = [
    {
      key: "all",
      label: "Все",
      href: buildAdminIngredientsHref(basePath, { q, category: category ?? "all", sort, pageSize }),
      count: Object.values(result.facets.byStatus).reduce((sum, count) => sum + count, 0)
    },
    ...ingredientCatalogStatuses.map((item) => ({
      key: item,
      label: ingredientCatalogStatusLabels[item],
      href: buildAdminIngredientsHref(basePath, {
        q,
        category: category ?? "all",
        status: item,
        sort,
        pageSize
      }),
      count: result.facets.byStatus[item]
    }))
  ];

  return (
    <section className="space-y-5 pb-[var(--nb-sticky-bar-h,0px)]">
      <AdminPageHeader
        title="Ингредиенты"
        actions={
          <>
            <Link
              href="/admin/ingredients/new"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-foreground px-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Новый ингредиент
            </Link>
            <Link
              href="/admin/ingredients/merge"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <ArrowRightLeft className="h-4 w-4" aria-hidden />
              Объединение дублей
            </Link>
            <Link
              href="/admin/ingredients/moderation"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <ShieldAlert className="h-4 w-4" aria-hidden />
              Очередь модерации
              <Badge size="sm" tone={result.pendingProposals > 0 ? "warning" : "neutral"}>
                {result.pendingProposals}
              </Badge>
            </Link>
          </>
        }
      />

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <AdminCatalogToolbar
          basePath={basePath}
          q={q}
          category={category}
          status={status}
          sort={sort}
          pageSize={pageSize}
        />
        <AdminFilterTabs label="Категории" tabs={categoryTabs} activeKey={category ?? "all"} />
        <AdminFilterTabs label="Статусы" tabs={statusTabs} activeKey={status ?? "all"} />
      </div>

      {result.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Ничего не найдено. Измените фильтры или создайте ингредиент.
          </p>
          <Link
            href="/admin/ingredients/new"
            className="mt-4 inline-flex min-h-9 items-center gap-1.5 rounded-md bg-foreground px-3 text-sm font-medium text-background"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Новый ингредиент
          </Link>
        </div>
      ) : (
        <AdminCatalogList
          items={result.items}
          basePath={basePath}
          q={q}
          category={category}
          status={status}
          sort={sort}
          pageSize={pageSize}
        />
      )}

      <AdminPagination
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        pageSize={result.pageSize}
      />
    </section>
  );
}
