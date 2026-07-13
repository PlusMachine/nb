import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PushSubscriptionsTable } from "@/components/admin/push/push-subscriptions-table";
import { listPushSubscriptions } from "@/features/notifications/admin";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Пуш-уведомления"
};

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="text-2xl font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

export default async function AdminPushPage() {
  await requireRole("admin");
  const { items, total, userCount, failingCount, browsers } = await listPushSubscriptions();

  return (
    <section className="space-y-6">
      <AdminPageHeader title="Пуш-уведомления" />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Подписок" value={total} />
        <StatTile label="Пользователей" value={userCount} />
        <StatTile label="С ошибками доставки" value={failingCount} />
      </div>

      {browsers.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {browsers.map((browser) => (
            <span
              key={browser.label}
              className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm text-foreground"
            >
              {browser.label}
              <span className="text-muted-foreground">{browser.count}</span>
            </span>
          ))}
        </div>
      ) : null}

      <PushSubscriptionsTable items={items} />
    </section>
  );
}
