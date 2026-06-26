"use client";

import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bookmark, X } from "lucide-react";

/**
 * Эфемерное уведомление после сохранения рецепта: явно говорит, КУДА он сохранён
 * и ГДЕ его найти (рабочая зона → «Избранное»), со ссылкой. Self-contained: портал
 * в body, авто-скрытие через 5с, без глобального toast-провайдера. В SSR (open=false)
 * вообще не трогает document.
 */
export function SavedToast({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const timer = window.setTimeout(onClose, 5000);
    return () => window.clearTimeout(timer);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[60] flex max-w-xs items-start gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg"
    >
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-50">
        <Bookmark className="h-4 w-4 fill-amber-500 text-amber-500" aria-hidden />
      </span>
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium text-zinc-900">Сохранено в «Избранное»</p>
        <p className="text-xs text-zinc-500">
          Найти можно в рабочей зоне:{" "}
          <Link href="/app/saved" className="font-medium text-zinc-900 underline underline-offset-2">
            Избранное
          </Link>
          .
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрыть уведомление"
        className="-mr-1 -mt-1 ml-auto rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>,
    document.body
  );
}
