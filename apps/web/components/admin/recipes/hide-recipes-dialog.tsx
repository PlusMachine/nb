"use client";

import React, { useEffect, useState } from "react";
import { Button, Dialog, DialogFooter, Textarea } from "@nb/ui";

import { HIDE_REASON_MAX_LENGTH, HIDE_REASON_MIN_LENGTH } from "@/features/recipes/admin-page-model";

// Причина скрытия обязательна: её видит автор у себя в списке рецептов, поэтому
// это не «поле для галочки», а текст, который читает живой человек.

export function HideRecipesDialog({
  open,
  count,
  pending,
  error,
  onConfirm,
  onClose
}: {
  open: boolean;
  count: number;
  pending: boolean;
  error: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setReason("");
    }
  }, [open]);

  const trimmed = reason.trim();
  const valid = trimmed.length >= HIDE_REASON_MIN_LENGTH && trimmed.length <= HIDE_REASON_MAX_LENGTH;
  const title = count > 1 ? `Скрыть рецепты: ${count}` : "Скрыть рецепт";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) {
          onClose();
        }
      }}
      title={title}
      hideTitle
      size="md"
      guard={{ isDirty: () => pending, onGuardedClose: () => {} }}
    >
      <div className="space-y-3 p-5">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>

        <p className="text-sm text-muted-foreground">
          Рецепт исчезнет с витрины, из поиска, карты сайта и с гостевой страницы пива. Автор увидит причину.
        </p>

        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={HIDE_REASON_MAX_LENGTH}
          placeholder="Причина скрытия"
          aria-label="Причина скрытия"
          disabled={pending}
        />

        {error ? (
          <p
            role="alert"
            className="rounded-lg bg-destructive-subtle px-3 py-2 text-sm text-destructive-subtle-foreground ring-1 ring-inset ring-destructive-border"
          >
            {error}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Отмена
        </Button>
        <Button type="button" variant="danger" onClick={() => onConfirm(trimmed)} disabled={pending || !valid}>
          {pending ? "Скрываем..." : "Скрыть"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
