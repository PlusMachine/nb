import Link from "next/link";

import { FeedbackQueue } from "@/components/feedback/feedback-queue";
import { feedbackStatuses, feedbackStatusLabels, type FeedbackStatus } from "@/features/feedback/contracts";
import { listFeedback } from "@/features/feedback/service";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const isFeedbackStatus = (value: string | undefined): value is FeedbackStatus =>
  Boolean(value) && (feedbackStatuses as readonly string[]).includes(value as string);

export default async function AdminFeedbackPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireRole("moderator");

  const { status } = await searchParams;
  const activeStatus = isFeedbackStatus(status) ? status : undefined;
  const items = await listFeedback(activeStatus ? { status: activeStatus } : undefined);

  const tabs: { label: string; status?: FeedbackStatus }[] = [
    { label: "Все" },
    ...feedbackStatuses.map((value) => ({ label: feedbackStatusLabels[value], status: value }))
  ];

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Обратная связь</h1>

      <nav className="flex flex-wrap gap-2 text-sm">
        {tabs.map((tab) => {
          const active = tab.status === activeStatus;
          const href = tab.status ? `/admin/feedback?status=${tab.status}` : "/admin/feedback";
          return (
            <Link
              key={tab.label}
              href={href}
              className={`rounded-full border px-3 py-1 transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Пока пусто.
        </p>
      ) : (
        <FeedbackQueue initialItems={items} />
      )}
    </section>
  );
}
