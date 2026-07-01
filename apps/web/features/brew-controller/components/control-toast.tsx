"use client";

// =============================================================================
//  ControlToast — эфемерный тост для отложенной команды с окном undo (SKIP_STAGE).
//  Self-contained (портал в body, без глобального провайдера), как SavedToast.
//  Пока тост виден — команда ещё НЕ отправлена; «Отменить» останавливает отправку.
// =============================================================================
import { createPortal } from "react-dom";
import { Undo2 } from "lucide-react";

import type { PendingUndo } from "../use-device-command";

export function ControlToast({ undo }: { undo: PendingUndo | null }) {
  if (!undo || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-900 px-4 py-2.5 text-white shadow-lg"
    >
      <span className="text-sm font-medium">{undo.label}</span>
      <button
        type="button"
        onClick={undo.cancel}
        className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/25"
      >
        <Undo2 className="h-3.5 w-3.5" aria-hidden />
        Отменить
      </button>
    </div>,
    document.body,
  );
}
