"use client";

import React from "react";
import { useState, useTransition } from "react";

import { deleteInventoryItemAction } from "@/app/(app)/app/ingredients/actions";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";

type Props = {
  inventoryItemId: string;
  displayName: string;
};

export function DeleteInventoryItemButton({ inventoryItemId, displayName }: Props) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setOpen(true);
        }}
        className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
      >
        {isPending ? "Удаляем..." : "Удалить ингредиент"}
      </button>
      {feedback ? <p className={`text-xs ${feedback.ok ? "text-emerald-700" : "text-red-600"}`}>{feedback.message}</p> : null}
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
