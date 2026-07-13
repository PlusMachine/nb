"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge, Button, Textarea, useToast } from "@nb/ui";

import { updateFeedbackStatusAction } from "@/app/(admin)/admin/feedback/actions";
import { feedbackStatusTones } from "@/features/feedback/admin-page-model";
import {
  feedbackKindLabels,
  feedbackStatusLabels,
  type FeedbackDto,
  type FeedbackStatus
} from "@/features/feedback/contracts";

const formatDate = (value: Date) =>
  new Date(value).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });

export function FeedbackQueue({ items }: { items: FeedbackDto[] }) {
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
        show({ title: "Не удалось обновить статус", tone: "danger" });
        return;
      }
      show({ title: `Статус: ${feedbackStatusLabels[status]}`, tone: "success" });
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const pending = pendingId === item.id;
        const author = item.submitterName ?? item.contactEmail ?? "Аноним";
        const noteId = `feedback-note-${item.id}`;

        return (
          <article key={item.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge size="sm">{feedbackKindLabels[item.kind]}</Badge>
              <Badge size="sm" tone={feedbackStatusTones[item.status]}>
                {feedbackStatusLabels[item.status]}
              </Badge>
              <span className="text-muted-foreground">{author}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{formatDate(item.createdAt)}</span>
            </div>

            <p className="whitespace-pre-wrap text-sm text-foreground">{item.message}</p>

            {item.pageUrl ? (
              <Link
                href={item.pageUrl}
                target="_blank"
                className="inline-block max-w-full truncate text-xs text-link underline underline-offset-2"
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

            <div className="grid gap-1.5">
              <label htmlFor={noteId} className="text-sm font-medium text-foreground">
                Заметка к резолюции
              </label>
              <Textarea
                id={noteId}
                className="min-h-16"
                defaultValue={item.resolutionNote ?? ""}
                onChange={(event) => setNotes((state) => ({ ...state, [item.id]: event.target.value }))}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => act(item.id, "in_progress")}
              >
                В работу
              </Button>
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={pending}
                onClick={() => act(item.id, "resolved")}
              >
                Решено
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => act(item.id, "dismissed")}
              >
                Отклонить
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
