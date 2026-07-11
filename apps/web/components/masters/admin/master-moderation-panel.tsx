"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@nb/ui";

import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import {
  approveMasterProfileAction,
  rejectMasterProfileAction,
  setMasterListedAction
} from "@/app/(admin)/admin/masters/actions";
import {
  MASTER_PUBLISHED_LABEL,
  masterReviewStatusLabels,
  type MasterReviewStatus
} from "@/features/masters/contracts";
import type { MasterProfileDto } from "@/features/masters/service";

const REJECT_NOTE_MIN = 3;
const REJECT_NOTE_MAX = 1000;

const reviewStatusBadgeClassName: Record<MasterReviewStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  pending: "bg-primary/10 text-primary",
  rejected: "bg-destructive-subtle text-destructive-subtle-foreground"
};

const formatDate = (value: Date) =>
  new Date(value).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });

export function MasterModerationPanel({ profile }: { profile: MasterProfileDto }) {
  const router = useRouter();
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();
  const [rejectNote, setRejectNote] = useState("");
  const [unlistOpen, setUnlistOpen] = useState(false);
  const [unlistError, setUnlistError] = useState<string | null>(null);

  const trimmedNote = rejectNote.trim();
  const noteValid = trimmedNote.length >= REJECT_NOTE_MIN && trimmedNote.length <= REJECT_NOTE_MAX;

  const handleApprove = () => {
    startTransition(async () => {
      const result = await approveMasterProfileAction(profile.id);
      if (!result.ok) {
        show({ title: "Не удалось опубликовать", description: result.error, tone: "danger" });
        return;
      }
      show({ title: "Опубликовано", tone: "success" });
      router.refresh();
    });
  };

  const handleReject = () => {
    if (!noteValid) {
      return;
    }
    startTransition(async () => {
      const result = await rejectMasterProfileAction(profile.id, trimmedNote);
      if (!result.ok) {
        show({ title: "Не удалось отклонить", description: result.error, tone: "danger" });
        return;
      }
      show({ title: "Заявка отклонена", tone: "success" });
      setRejectNote("");
      router.refresh();
    });
  };

  const handleSetListed = (isListed: boolean) => {
    startTransition(async () => {
      const result = await setMasterListedAction(profile.id, isListed);
      if (!result.ok) {
        setUnlistError(result.error);
        show({ title: "Не удалось изменить видимость", description: result.error, tone: "danger" });
        return;
      }
      setUnlistOpen(false);
      setUnlistError(null);
      show({ title: isListed ? "Возвращено на витрину" : "Снято с витрины", tone: "success" });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <Link href="/admin/masters" className="text-xs text-muted-foreground transition hover:text-foreground">
            ← К очереди
          </Link>
          <h1 className="text-lg font-semibold text-foreground">{profile.displayName}</h1>
          <p className="text-sm text-muted-foreground">{profile.city}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-medium ${reviewStatusBadgeClassName[profile.reviewStatus]}`}>
            {masterReviewStatusLabels[profile.reviewStatus]}
          </span>
          {profile.hasPublished ? (
            <span className="rounded-full bg-success-subtle px-2 py-0.5 font-medium text-success-subtle-foreground">
              {MASTER_PUBLISHED_LABEL}
            </span>
          ) : null}
          {profile.hasPublished && !profile.isListed ? (
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">Скрыт</span>
          ) : null}
        </div>
      </div>

      {profile.submittedAt ? (
        <p className="text-xs text-muted-foreground">Подано на модерацию: {formatDate(profile.submittedAt)}</p>
      ) : null}

      {profile.hasPublished && profile.reviewStatus === "pending" ? (
        <p className="rounded-lg bg-warning-subtle px-3 py-2 text-xs text-warning-subtle-foreground">
          Это правки к уже опубликованному профилю — пока они на модерации, витрина показывает прежнюю версию.
        </p>
      ) : null}

      {profile.reviewStatus === "rejected" && profile.moderationNote ? (
        <p className="rounded-lg bg-destructive-subtle px-3 py-2 text-sm text-destructive-subtle-foreground">
          Заметка модератора: {profile.moderationNote}
        </p>
      ) : null}

      {profile.reviewStatus === "pending" ? (
        <div className="space-y-3 border-t border-border pt-4">
          <Button type="button" variant="primary" disabled={isPending} onClick={handleApprove}>
            {isPending ? "Публикуем…" : "Опубликовать"}
          </Button>

          <div className="space-y-2">
            <label htmlFor="master-reject-note" className="sr-only">
              Заметка для мастера — почему отклонено
            </label>
            <textarea
              id="master-reject-note"
              value={rejectNote}
              onChange={(event) => setRejectNote(event.target.value)}
              placeholder="Заметка для мастера — почему отклонено (3–1000 символов)"
              className="h-24 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="dangerOutline" disabled={isPending || !noteValid} onClick={handleReject}>
                {isPending ? "Отклоняем…" : "Отклонить"}
              </Button>
              {trimmedNote.length > 0 && trimmedNote.length < REJECT_NOTE_MIN ? (
                <span className="text-xs text-muted-foreground">Нужно ещё {REJECT_NOTE_MIN - trimmedNote.length} симв.</span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {profile.hasPublished ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {profile.slug ? (
            <Link
              href={`/masters/${profile.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-primary underline underline-offset-2"
            >
              Открыть публичную страницу
            </Link>
          ) : null}

          {profile.isListed ? (
            <Button
              type="button"
              variant="dangerOutline"
              size="sm"
              disabled={isPending}
              onClick={() => setUnlistOpen(true)}
            >
              Снять с витрины
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => handleSetListed(true)}>
              {isPending ? "Возвращаем…" : "Вернуть на витрину"}
            </Button>
          )}
        </div>
      ) : null}

      <ConfirmActionDialog
        open={unlistOpen}
        title="Снять с витрины?"
        description="Публичная страница мастера станет недоступна. Контент сохранится — вернуть видимость можно в любой момент."
        confirmLabel="Снять с витрины"
        pendingLabel="Снимаем…"
        pending={isPending}
        error={unlistError}
        onClose={() => {
          setUnlistOpen(false);
          setUnlistError(null);
        }}
        onConfirm={() => handleSetListed(false)}
      />
    </div>
  );
}
