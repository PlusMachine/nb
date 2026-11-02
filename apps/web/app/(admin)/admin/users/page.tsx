import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { UsersTable } from "@/components/admin/users/users-table";
import { UsersToolbar } from "@/components/admin/users/users-toolbar";
import {
  ADMIN_USERS_PAGE_SIZE_DEFAULT,
  defaultAdminUserSortOption,
  parseAdminUserFilters
} from "@/features/admin-users/contracts";
import { listAdminUsers } from "@/features/admin-users/service";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("admin");

  const params = await searchParams;
  const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const filters = parseAdminUserFilters({
    q: single(params.q),
    role: single(params.role),
    status: single(params.status),
    sort: single(params.sort),
    page: single(params.page),
    pageSize: single(params.pageSize),
    segment: single(params.segment)
  });

  const result = await listAdminUsers(filters);
  const exportQuery = new URLSearchParams(
    Object.entries({ q: filters.q, role: filters.role, status: filters.status, segment: filters.segment, sort: filters.sort })
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );

  return (
    <section className="space-y-5">
      <AdminPageHeader
        title="Пользователи"
        actions={
          <a href={`/api/admin/users/export?${exportQuery}`} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">
            Скачать CSV
          </a>
        }
      />

      <UsersToolbar
        basePath="/admin/users"
        q={filters.q ?? ""}
        role={filters.role}
        status={filters.status}
        sort={filters.sort ?? defaultAdminUserSortOption}
        pageSize={filters.pageSize ?? ADMIN_USERS_PAGE_SIZE_DEFAULT}
        segment={filters.segment}
      />

      <p className="text-xs text-muted-foreground">Последние визиты собираются с согласия на аналитику. «Нет данных» не означает отсутствие активности. Выгрузка учитывает фильтры и содержит до 10 000 пользователей.</p>

      <UsersTable items={result.items} />

      <AdminPagination
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        pageSize={result.pageSize}
      />
    </section>
  );
}
