"use client";

import React from "react";
import { useState, useTransition } from "react";

import { deleteInventoryItemAction } from "@/app/(app)/app/ingredients/actions";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";

type Props = {
  inventoryItemId: string;
  displayName: string;
  renderTrigger?: (onClick: () => void, isPending: boolean) => React.ReactNode;
};

export function DeleteInventoryItemButton({ inventoryItemId, displayName, renderTrigger }: Props) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleOpen = () => setOpen(true);

  return (
    <div className="space-y-1">
      {renderTrigger
        ? renderTrigger(handleOpen, isPending)
        : (
          <button
            type="button"
            disabled={isPending}
            onClick={handleOpen}
            className="rounded border border-destructive-border px-2 py-1 text-xs text-destructive hover:bg-destructive-subtle disabled:opacity-60"
          >
            {isPending ? "Удаляем..." : "Удалить ингредиент"}
          </button>
        )}
      {feedback ? (
        <p role={feedback.ok ? "status" : "alert"} className={`text-xs ${feedback.ok ? "text-success" : "text-destructive"}`}>
          {feedback.message}
        </p>
      ) : null}
      <ConfirmActionDialog
        open={open}
        title="Удалить ингредиент?"
        description={`Позиция "${displayName}" будет удалена из запасов без возможности восстановления.`}
        confirmLabel="Удалить ингредиент"
        pending={isPending}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          startTransition(async () => {
            const result = await deleteInventoryItemAction(inventoryItemId);
            setFeedback(result);
            if (result.ok) {
              setOpen(false);
            }
          });
        }}
      />
    </div>
  );
}
