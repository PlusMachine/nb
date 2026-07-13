import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AuditLogList } from "@/components/admin/audit/audit-log-list";
import { AuditLogToolbar } from "@/components/admin/audit/audit-log-toolbar";
import { parseAuditLogQuery } from "@/features/audit/page-model";
import { listAuditEvents } from "@/features/audit/service";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("admin");

  const query = parseAuditLogQuery(await searchParams);
  const result = await listAuditEvents(query);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <section className="space-y-4">
      <AdminPageHeader title="Журнал действий" />

      <AuditLogToolbar query={query} />

      <AuditLogList items={result.items} />

      <AdminPagination
        page={result.page}
        totalPages={totalPages}
        total={result.total}
        pageSize={result.pageSize}
      />
    </section>
  );
}
