import Link from "next/link";

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

const reviewStatusBadgeClassName: Record<MasterReviewStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  pending: "bg-primary/10 text-primary",
  rejected: "bg-destructive-subtle text-destructive-subtle-foreground"
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

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Мастера</h1>

      <nav className="flex flex-wrap gap-2 text-sm">
        {MASTER_QUEUE_STATUSES.map((value) => {
          const active = value === activeStatus;
          const href = value === "pending" ? "/admin/masters" : `/admin/masters?status=${value}`;
          return (
            <Link
              key={value}
              href={href}
              className={`rounded-full border px-3 py-1 transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {TAB_LABELS[value]}
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
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
      className="block space-y-2 rounded-lg border p-4 transition-colors hover:bg-accent"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-foreground">{item.displayName}</h2>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {isPublishedTab ? (
            <span className="rounded-full bg-success-subtle px-2 py-0.5 font-medium text-success-subtle-foreground">
              {MASTER_PUBLISHED_LABEL}
            </span>
          ) : (
            <span className={`rounded-full px-2 py-0.5 font-medium ${reviewStatusBadgeClassName[item.reviewStatus]}`}>
              {masterReviewStatusLabels[item.reviewStatus]}
            </span>
          )}
          {isPublishedTab && !item.isListed ? (
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">Скрыт</span>
          ) : null}
          {isPublishedTab && item.reviewStatus === "pending" ? (
            <span className="rounded-full bg-warning-subtle px-2 py-0.5 font-medium text-warning-subtle-foreground">
              Правки на модерации
            </span>
          ) : null}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{item.city}</p>
      {date ? <p className="text-xs text-muted-foreground">{formatDate(date)}</p> : null}
    </Link>
  );
}
