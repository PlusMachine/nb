"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MoreHorizontal, Pencil, RotateCcw, Sticker, Trash2, XCircle } from "lucide-react";

import { Button, Dialog, DialogFooter, DropdownMenu, type DropdownMenuItem } from "@nb/ui";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import {
  deleteBrewBatchAction,
  setBrewBatchStatusAction
} from "@/app/(app)/app/brew-batches/[id]/actions";
import {
  brewBatchStatusLabels,
  type BrewBatchStatus
} from "@/features/brew-batches/contracts";

// Ручная установка этапа — редкий путь (исправление ошибки), не основной flow:
// обычно статус двигают кнопки перехода в актах. Отмена — здесь же.
const MANUAL_STATUSES: BrewBatchStatus[] = ["planned", "brewing", "fermenting", "completed"];

/**
 * Меню партии (⋯): ручная смена этапа, отмена и удаление. На списке
 * (`compact`) оставляем только отмену/восстановление и удаление — без
 * ручной смены этапа и наклеек.
 */
export function BatchMenu({
  brewBatchId,
  status,
  labelsHref,
  variant = "full"
}: {
  brewBatchId: string;
  status: BrewBatchStatus;
  /** Ссылка на наклейки; null — посчитать некуда (нет ни рецепта, ни снапшота) либо этап не подходит. */
  labelsHref?: string | null;
  /** `full` — на странице детали; `compact` — на списке партий. */
  variant?: "full" | "compact";
}) {
  const router = useRouter();
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
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
      if (variant === "compact") {
        router.refresh();
      }
      return true;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const remove = async (): Promise<boolean> => {
    if (inFlight.current) {
      return false;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await deleteBrewBatchAction(brewBatchId);
      if (!result.ok) {
        setError(result.message);
        return false;
      }
      if (variant === "full") {
        router.push("/app/brew-batches");
      } else {
        router.refresh();
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
    ...(variant === "full"
      ? [
          {
            key: "edit-stage",
            label: "Изменить этап…",
            icon: <Pencil className="h-4 w-4" aria-hidden />,
            onSelect: () => setStatusDialogOpen(true)
          } satisfies DropdownMenuItem,
          ...(showLabels
            ? [
                {
                  key: "labels",
                  label: "Наклейки",
                  icon: <Sticker className="h-4 w-4" aria-hidden />,
                  onSelect: () => router.push(labelsHref as string)
                } satisfies DropdownMenuItem
              ]
            : [])
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
          label: "Отменить партию",
          icon: <XCircle className="h-4 w-4" aria-hidden />,
          tone: "danger" as const,
          onSelect: () => { setError(null); setCancelOpen(true); }
        },
    {
      key: "delete",
      label: "Удалить",
      icon: <Trash2 className="h-4 w-4" aria-hidden />,
      tone: "danger",
      onSelect: () => { setError(null); setDeleteOpen(true); }
    }
  ];

  return (
    <>
      <DropdownMenu
        align="end"
        aria-label="Действия с партией"
        trigger={
          <button
            type="button"
            aria-label="Действия с партией"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground before:absolute before:-inset-1 before:content-['']"
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden />
          </button>
        }
        items={items}
      />

      {variant === "full" ? (
        <Dialog
          open={statusDialogOpen}
          onOpenChange={(next) => { if (!next && !busy) { setStatusDialogOpen(false); setError(null); } }}
          title="Изменить этап"
          size="md"
        >
          <div className="space-y-3 p-5">
            <p className="text-sm text-muted-foreground">Обычно переход к следующему этапу выполняется кнопками на странице. Здесь можно выбрать этап вручную — например, чтобы исправить ошибку.</p>
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
      ) : null}

      <ConfirmActionDialog
        open={cancelOpen}
        title="Отменить партию?"
        description="Партия будет помечена отменённой. Остатки на складе не изменятся. Неиспользованные ингредиенты можно вернуть отдельно. Партию можно вернуть в план."
        confirmLabel="Отменить партию"
        tone="danger"
        pending={busy}
        error={error}
        onConfirm={async () => { if (await apply("cancelled")) { setCancelOpen(false); } }}
        onClose={() => { if (!busy) { setCancelOpen(false); setError(null); } }}
      />

      <ConfirmActionDialog
        open={deleteOpen}
        title="Удалить партию?"
        description="Партия будет удалена безвозвратно вместе с журналом замеров. Остатки на складе не изменятся. Если ингредиенты не были использованы, верните их на склад до удаления партии."
        confirmLabel="Удалить партию"
        tone="danger"
        pending={busy}
        error={error}
        onConfirm={async () => { if (await remove()) { setDeleteOpen(false); } }}
        onClose={() => { if (!busy) { setDeleteOpen(false); setError(null); } }}
      />
    </>
  );
}
