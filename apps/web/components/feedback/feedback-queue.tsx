"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@nb/ui";

import { updateFeedbackStatusAction } from "@/app/(admin)/admin/feedback/actions";
import {
  feedbackKindLabels,
  feedbackStatusLabels,
  type FeedbackDto,
  type FeedbackStatus
} from "@/features/feedback/contracts";

const statusBadgeClass: Record<FeedbackStatus, string> = {
  new: "bg-primary/10 text-primary",
  in_progress: "bg-warning-subtle text-warning-subtle-foreground",
  resolved: "bg-success-subtle text-success-subtle-foreground",
  dismissed: "bg-muted text-muted-foreground"
};

const formatDate = (value: Date) =>
  new Date(value).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });

export function FeedbackQueue({ initialItems }: { initialItems: FeedbackDto[] }) {
  const router = useRouter();
  const { show } = useToast();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const act = (id: string, status: FeedbackStatus) => {
    setPendingId(id);
    startTransition(async () => {
      const result = await updateFeedbackStatusAction({ id, status, note: notes[id] });
      setPendingId(null);
      if (!result.ok) {
        show({ title: "Не удалось обновить статус" });
        return;
      }
      show({ title: `Статус: ${feedbackStatusLabels[status]}` });
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {initialItems.map((item) => {
        const pending = pendingId === item.id;
        const author = item.submitterName ?? item.contactEmail ?? "Аноним";
        return (
          <article key={item.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-accent px-2 py-0.5 font-medium text-foreground">
                {feedbackKindLabels[item.kind]}
              </span>
              <span className={`rounded-full px-2 py-0.5 font-medium ${statusBadgeClass[item.status]}`}>
                {feedbackStatusLabels[item.status]}
              </span>
              <span className="text-muted-foreground">{author}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{formatDate(item.createdAt)}</span>
            </div>

            <p className="whitespace-pre-wrap text-sm text-foreground">{item.message}</p>

            {item.pageUrl ? (
              <Link
                href={item.pageUrl}
                target="_blank"
                className="inline-block max-w-full truncate text-xs text-primary underline underline-offset-2"
                title={item.pageUrl}
              >
                {item.pagePath ?? item.pageUrl}
              </Link>
            ) : null}

            {item.resolutionNote ? (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Резолюция: {item.resolutionNote}
              </p>
            ) : null}

            <textarea
              placeholder="Заметка к резолюции (необязательно)"
              defaultValue={item.resolutionNote ?? ""}
              onChange={(event) => setNotes((state) => ({ ...state, [item.id]: event.target.value }))}
              className="h-16 w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => act(item.id, "in_progress")}
                className="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
              >
                В работу
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => act(item.id, "resolved")}
                className="rounded-md border border-success-border bg-success-subtle px-3 py-1.5 text-sm font-medium text-success-subtle-foreground transition-colors hover:opacity-90 disabled:opacity-50"
              >
                Решено
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => act(item.id, "dismissed")}
                className="rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                Отклонить
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
