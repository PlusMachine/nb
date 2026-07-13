import Link from "next/link";

import { Badge, type BadgeTone } from "@nb/ui";
import { AdminFilterTabs, type AdminFilterTab } from "@/components/admin/admin-filter-tabs";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  MASTER_PUBLISHED_LABEL,
  masterReviewStatusLabels,
  type MasterReviewStatus
} from "@/features/masters/contracts";
import { listMasterModerationQueue, type MasterProfileDto } from "@/features/masters/service";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

type MasterQueueStatus = "pending" | "published" | "rejected";
const MASTER_QUEUE_STATUSES: MasterQueueStatus[] = ["pending", "published", "rejected"];

const isMasterQueueStatus = (value: string | undefined): value is MasterQueueStatus =>
  Boolean(value) && (MASTER_QUEUE_STATUSES as string[]).includes(value as string);

const TAB_LABELS: Record<MasterQueueStatus, string> = {
  pending: "На модерации",
  published: "Опубликованные",
  rejected: "Отклонённые"
};

const EMPTY_LABELS: Record<MasterQueueStatus, string> = {
  pending: "Заявок на модерации нет.",
  published: "Опубликованных витрин пока нет.",
  rejected: "Отклонённых заявок нет."
};

const reviewStatusTones: Record<MasterReviewStatus, BadgeTone> = {
  draft: "neutral",
  pending: "info",
  rejected: "danger"
};

const formatDate = (value: Date) =>
  new Date(value).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });

export default async function AdminMastersPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireRole("moderator");

  const { status } = await searchParams;
  const activeStatus: MasterQueueStatus = isMasterQueueStatus(status) ? status : "pending";

  const items = await listMasterModerationQueue({ id: user.id, role: user.role }, { status: activeStatus });

  // Счётчик показываем только у активного таба: очередь грузится по одному
  // статусу за раз, считать остальные — три лишних запроса на каждый заход.
  const tabs: AdminFilterTab[] = MASTER_QUEUE_STATUSES.map((value) => ({
    key: value,
    label: TAB_LABELS[value],
    href: value === "pending" ? "/admin/masters" : `/admin/masters?status=${value}`,
    count: value === activeStatus ? items.length : undefined
  }));

  return (
    <section className="space-y-5">
      <AdminPageHeader title="Маркет" />

      <AdminFilterTabs label="Статусы" tabs={tabs} activeKey={activeStatus} />

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {EMPTY_LABELS[activeStatus]}
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <MasterQueueCard key={item.id} item={item} activeStatus={activeStatus} />
          ))}
        </div>
      )}
    </section>
  );
}

function MasterQueueCard({ item, activeStatus }: { item: MasterProfileDto; activeStatus: MasterQueueStatus }) {
  const isPublishedTab = activeStatus === "published";
  const date = isPublishedTab ? item.publishedAt : item.submittedAt;

  return (
    <Link
      href={`/admin/masters/${item.id}`}
      className="block space-y-2 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-foreground">{item.displayName}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {isPublishedTab ? (
            <Badge size="sm" tone="success">{MASTER_PUBLISHED_LABEL}</Badge>
          ) : (
            <Badge size="sm" tone={reviewStatusTones[item.reviewStatus]}>
              {masterReviewStatusLabels[item.reviewStatus]}
            </Badge>
          )}
          {isPublishedTab && !item.isListed ? <Badge size="sm">Скрыт</Badge> : null}
          {isPublishedTab && item.reviewStatus === "pending" ? (
            <Badge size="sm" tone="warning">Правки на модерации</Badge>
          ) : null}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{item.city}</p>
      {date ? <p className="text-xs text-muted-foreground">{formatDate(date)}</p> : null}
    </Link>
  );
}
