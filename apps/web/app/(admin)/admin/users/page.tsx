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
    pageSize: single(params.pageSize)
  });

  const result = await listAdminUsers(filters);

  return (
    <section className="space-y-5">
      <AdminPageHeader title="Пользователи" />

      <UsersToolbar
        basePath="/admin/users"
        q={filters.q ?? ""}
        role={filters.role}
        status={filters.status}
        sort={filters.sort ?? defaultAdminUserSortOption}
        pageSize={filters.pageSize ?? ADMIN_USERS_PAGE_SIZE_DEFAULT}
      />

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
