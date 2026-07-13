import { notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { UserActionsPanel } from "@/components/admin/users/user-actions-panel";
import { UserStatusBadge } from "@/components/admin/users/user-status-badge";
import { getAdminUserDetail } from "@/features/admin-users/service";
import { userRoleLabels } from "@/features/admin-users/contracts";
import { listAuditEvents } from "@/features/audit/service";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const formatDateTime = (value: Date) =>
  new Date(value).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm text-foreground">{children}</dd>
    </div>
  );
}

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole("admin");
  const { id } = await params;

  const user = await getAdminUserDetail(id);
  if (!user) {
    notFound();
  }

  const auditLog = await listAuditEvents({ entityType: "user", entityId: user.id, pageSize: 10 });
  const { activity } = user;

  return (
    <section className="space-y-5">
      <AdminPageHeader
        title={user.displayName}
        backHref="/admin/users"
        backLabel="К пользователям"
        actions={<UserStatusBadge status={user.status} />}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">Профиль</h2>
            <dl className="mt-2 divide-y divide-border">
              <Row label="E-mail">
                {user.email ? (
                  <span className="break-all">
                    {user.email}
                    {user.emailVerified ? null : <span className="ml-2 text-muted-foreground">не подтверждён</span>}
                  </span>
                ) : (
                  "—"
                )}
              </Row>
              <Row label="Телефон">
                {user.phone ? (
                  <span>
                    {user.phone}
                    {user.phoneVerified ? null : <span className="ml-2 text-muted-foreground">не подтверждён</span>}
                  </span>
                ) : (
                  "—"
                )}
              </Row>
              <Row label="Роль">{userRoleLabels[user.role]}</Row>
              <Row label="Регистрация">{formatDateTime(user.createdAt)}</Row>
              {user.blockedAt ? (
                <Row label="Заблокирован">
                  {formatDateTime(user.blockedAt)}
                  {user.blockedByName ? <span className="text-muted-foreground"> · {user.blockedByName}</span> : null}
                </Row>
              ) : null}
              {user.blockedReason ? <Row label="Причина">{user.blockedReason}</Row> : null}
              {user.anonymizedAt ? <Row label="Обезличен">{formatDateTime(user.anonymizedAt)}</Row> : null}
            </dl>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">Активность</h2>
            <dl className="mt-2 divide-y divide-border">
              <Row label="Рецепты">
                {activity.recipesCount}
                {activity.publishedRecipesCount > 0 ? (
                  <span className="text-muted-foreground"> · опубликовано {activity.publishedRecipesCount}</span>
                ) : null}
              </Row>
              <Row label="Партии">{activity.batchesCount}</Row>
              <Row label="Склад">{activity.inventoryCount}</Row>
              <Row label="Устройства">{activity.devicesCount}</Row>
              <Row label="Витрина мастера">
                {activity.masterProfile ? (
                  <span>
                    {activity.masterProfile.displayName}
                    <span className="text-muted-foreground">
                      {" "}
                      · {activity.masterProfile.isListed ? "на витрине" : "скрыта"}
                    </span>
                  </span>
                ) : (
                  "—"
                )}
              </Row>
            </dl>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">Журнал</h2>
            {auditLog.items.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Действий по этому аккаунту пока не было.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {auditLog.items.map((entry) => (
                  <li key={entry.id} className="py-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-sm font-medium text-foreground">{entry.actionLabel}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {entry.actorName}
                      {entry.summary ? ` · ${entry.summary}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <UserActionsPanel user={user} isSelf={user.id === actor.id} />
      </div>
    </section>
  );
}
