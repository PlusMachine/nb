"use client";

import React from "react";
import { useState, useTransition } from "react";

import { deleteRecipeAction } from "@/app/(app)/app/recipes/actions";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";

type Props = {
  recipeId: string;
  title: string;
  renderTrigger?: (onClick: () => void, isPending: boolean) => React.ReactNode;
};

export function DeleteRecipeButton({ recipeId, title, renderTrigger }: Props) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const defaultTrigger = (
    <button
      type="button"
      disabled={isPending}
      onClick={() => setOpen(true)}
      className="text-sm font-medium text-red-700 hover:text-red-900 disabled:opacity-60"
    >
      {isPending ? "Удаляем..." : "Удалить"}
    </button>
  );

  return (
    <div className="space-y-1">
      {renderTrigger ? renderTrigger(() => setOpen(true), isPending) : defaultTrigger}
      {feedback ? <p className={`text-xs ${feedback.ok ? "text-emerald-700" : "text-red-600"}`}>{feedback.message}</p> : null}
      <ConfirmActionDialog
        open={open}
        title="Удалить рецепт?"
        description={`Рецепт "${title}" будет удален целиком вместе с ингредиентами и параметрами.`}
        confirmLabel="Удалить рецепт"
        pending={isPending}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          startTransition(async () => {
            const result = await deleteRecipeAction(recipeId);
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
