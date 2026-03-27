"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";

type Props = {
  ingredientId: string;
  displayName: string;
};

type DeleteIngredientResult = {
  mode: "deleted" | "archived";
  id: string;
  displayName: string;
};

export function DeleteCatalogIngredientButton({ ingredientId, displayName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
      >
        {isPending ? "Удаляем..." : "Удалить"}
      </button>

      {feedback ? <p className="text-[11px] leading-4 text-zinc-500">{feedback}</p> : null}

      <ConfirmActionDialog
        open={open}
        title="Удалить ингредиент?"
        description={`Если ингредиент не используется, он будет удален из каталога. Если на него есть ссылки в рецептах, складе или merge-истории, он будет переведен в архив.`}
        confirmLabel="Удалить ингредиент"
        pendingLabel="Удаляем..."
        pending={isPending}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          startTransition(async () => {
            const response = await fetch(`/api/admin/ingredients/${ingredientId}`, {
              method: "DELETE"
            });

            const data = await response.json() as { error?: string } & Partial<DeleteIngredientResult>;
            if (!response.ok) {
              setFeedback(data.error ?? "Не удалось удалить ингредиент.");
              return;
            }

            setFeedback(
              data.mode === "archived"
                ? `«${displayName}» переведен в архив, потому что уже используется в данных.`
                : `«${displayName}» удален из каталога.`
            );
            setOpen(false);
            router.refresh();
          });
        }}
      />
    </div>
  );
}
