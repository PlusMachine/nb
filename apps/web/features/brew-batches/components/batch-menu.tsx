"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MoreHorizontal, Pencil, RotateCcw, Sticker, XCircle } from "lucide-react";

import { Button, Dialog, DialogFooter, DropdownMenu, type DropdownMenuItem } from "@nb/ui";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { setBrewBatchStatusAction } from "@/app/(app)/app/brew-batches/[id]/actions";
import {
  brewBatchStatusLabels,
  type BrewBatchStatus
} from "@/features/brew-batches/contracts";

// Ручная установка этапа — редкий путь (исправление ошибки), не основной flow:
// обычно статус двигают кнопки перехода в актах. Отмена — здесь же.
const MANUAL_STATUSES: BrewBatchStatus[] = ["planned", "brewing", "fermenting", "completed"];

/**
 * Меню партии (⋯) в шапке: ручная смена этапа и отмена варки. Заменяет собой
 * доминировавший на странице виджет жизненного цикла — статус двигается гидом, а
 * ручной путь спрятан под меню. Отмена — только через подтверждение.
 */
export function BatchMenu({
  brewBatchId,
  status,
  labelsHref
}: {
  brewBatchId: string;
  status: BrewBatchStatus;
  /** Ссылка на наклейки; null — посчитать некуда (нет ни рецепта, ни снапшота) либо этап не подходит. */
  labelsHref?: string | null;
}) {
  const router = useRouter();
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const apply = async (next: BrewBatchStatus): Promise<boolean> => {
    if (inFlight.current || next === status) {
      return false;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await setBrewBatchStatusAction(brewBatchId, next);
      if (!result.ok) {
        setError(result.message);
        return false;
      }
      return true;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  // Наклейки нужны у розлива (этап packaging внутри акта «Брожение») и после —
  // пока варка в плане или варочном дне, разливать ещё нечего.
  const showLabels = Boolean(labelsHref) && (status === "fermenting" || status === "completed");

  const items: DropdownMenuItem[] = [
    {
      key: "edit-stage",
      label: "Изменить этап…",
      icon: <Pencil className="h-4 w-4" aria-hidden />,
      onSelect: () => setStatusDialogOpen(true)
    },
    ...(showLabels
      ? [
          {
            key: "labels",
            label: "Наклейки",
            icon: <Sticker className="h-4 w-4" aria-hidden />,
            onSelect: () => router.push(labelsHref as string)
          }
        ]
      : []),
    status === "cancelled"
      ? {
          key: "restore",
          label: "Вернуть в план",
          icon: <RotateCcw className="h-4 w-4" aria-hidden />,
          onSelect: () => void apply("planned")
        }
      : {
          key: "cancel",
          label: "Отменить варку",
          icon: <XCircle className="h-4 w-4" aria-hidden />,
          tone: "danger" as const,
          onSelect: () => setCancelOpen(true)
        }
  ];

  return (
    <>
      <DropdownMenu
        align="end"
        aria-label="Действия с варкой"
        trigger={
          <button
            type="button"
            aria-label="Действия с варкой"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground before:absolute before:-inset-1 before:content-['']"
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden />
          </button>
        }
        items={items}
      />

      <Dialog
        open={statusDialogOpen}
        onOpenChange={(next) => { if (!next && !busy) { setStatusDialogOpen(false); setError(null); } }}
        title="Изменить этап"
        size="md"
      >
        <div className="space-y-3 p-5">
          <p className="text-sm text-muted-foreground">Обычно этап двигают кнопки на странице. Здесь можно выставить его вручную — например, чтобы исправить ошибку.</p>
          <div className="grid grid-cols-2 gap-2">
            {MANUAL_STATUSES.map((option) => {
              const isCurrent = option === status;
              return (
                <button
                  key={option}
                  type="button"
                  disabled={busy || isCurrent}
                  onClick={async () => { if (await apply(option)) { setStatusDialogOpen(false); } }}
                  className={`inline-flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${
                    isCurrent
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-foreground hover:bg-muted"
                  }`}
                >
                  {brewBatchStatusLabels[option]}
                  {isCurrent ? <Check className="h-4 w-4" aria-hidden /> : busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                </button>
              );
            })}
          </div>
          {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => { if (!busy) { setStatusDialogOpen(false); setError(null); } }} disabled={busy}>
            Закрыть
          </Button>
        </DialogFooter>
      </Dialog>

      <ConfirmActionDialog
        open={cancelOpen}
        title="Отменить варку?"
        description="Варка будет помечена отменённой. Списанные на неё ингредиенты вернутся на склад. Это действие можно откатить («Вернуть в план»)."
        confirmLabel="Отменить варку"
        tone="danger"
        pending={busy}
        error={error}
        onConfirm={async () => { if (await apply("cancelled")) { setCancelOpen(false); } }}
        onClose={() => { if (!busy) { setCancelOpen(false); setError(null); } }}
      />
    </>
  );
}
