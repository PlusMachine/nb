"use client";

import React, { useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@nb/ui";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { setBrewBatchStatusAction } from "@/app/(app)/app/brew-batches/[id]/actions";
import { type BrewBatchStatus } from "@/features/brew-batches/contracts";

type ButtonVariant = "default" | "primary" | "outline" | "ghost" | "danger" | "dangerOutline";

/**
 * Кнопка перехода партии в следующий статус (пуск дня / на брожение / завершить).
 * Основной способ двигать статус — гидом, а не отдельным виджетом жизненного цикла.
 * При `confirm` спрашивает подтверждение (мягкий гейт, если акт ещё не пройден).
 */
export function BrewTransitionButton({
  brewBatchId,
  to,
  label,
  variant = "primary",
  size = "md",
  icon,
  confirm = null,
  className
}: {
  brewBatchId: string;
  to: BrewBatchStatus;
  label: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  icon?: React.ReactNode;
  confirm?: { title: string; description: string } | null;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inFlight = useRef(false);

  const run = async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await setBrewBatchStatusAction(brewBatchId, to);
      if (!result.ok) {
        setError(result.message);
      } else {
        setConfirmOpen(false);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={busy}
        onClick={() => (confirm ? setConfirmOpen(true) : run())}
      >
        {busy && !confirm ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
        {label}
      </Button>
      {error && !confirmOpen ? <p role="alert" className="mt-1 text-xs text-destructive">{error}</p> : null}

      {confirm ? (
        <ConfirmActionDialog
          open={confirmOpen}
          title={confirm.title}
          description={confirm.description}
          confirmLabel={label}
          tone="primary"
          pending={busy}
          error={error}
          onConfirm={run}
          onClose={() => {
            if (!busy) {
              setConfirmOpen(false);
              setError(null);
            }
          }}
        />
      ) : null}
    </div>
  );
}
