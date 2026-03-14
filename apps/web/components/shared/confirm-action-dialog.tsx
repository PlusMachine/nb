"use client";

import React from "react";
import { useEffect } from "react";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  pending?: boolean;
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
  onConfirm,
  onClose
}: Props) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, pending, onClose]);

  if (!open) {
    return null;
  }

  const iconClassName = tone === "primary"
    ? "bg-emerald-50 text-emerald-700"
    : "bg-red-50 text-red-700";
  const confirmButtonClassName = tone === "primary"
    ? "bg-emerald-600 hover:bg-emerald-700"
    : "bg-red-600 hover:bg-red-700";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/45 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={() => {
        if (!pending) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start gap-3">
          <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconClassName}`}>
            <span className="text-lg font-semibold">!</span>
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-zinc-950">{title}</h3>
            <p className="text-sm leading-6 text-zinc-600">{description}</p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`rounded-xl px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-60 ${confirmButtonClassName}`}
          >
            {pending ? (pendingLabel ?? `${confirmLabel}...`) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
