"use client";

import React from "react";

import { Button, Dialog, DialogFooter } from "@nb/ui";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmActionDialog({
  open,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Отмена",
  tone = "danger",
  pending = false,
  error = null,
  onConfirm,
  onClose
}: Props) {
  const iconClassName = tone === "primary"
    ? "bg-emerald-50 text-emerald-700"
    : "bg-red-50 text-red-700";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      title={title}
      hideTitle
      size="md"
      guard={{ isDirty: () => pending, onGuardedClose: () => {} }}
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconClassName}`}>
            <span className="text-lg font-semibold">!</span>
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-zinc-950">{title}</h3>
            <p className="text-sm leading-6 text-zinc-600">{description}</p>
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200"
          >
            {error}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button type="button" variant={tone} onClick={onConfirm} disabled={pending}>
          {pending ? (pendingLabel ?? `${confirmLabel}...`) : confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
