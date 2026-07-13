"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@nb/ui";

import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";

type Props = {
  ingredientId: string;
  displayName: string;
};

type DeleteIngredientResult = {
  id: string;
  displayName: string;
  archived: boolean;
};

const ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN: "Недостаточно прав.",
  NOT_FOUND: "Ингредиент не найден — обновите страницу."
};

export function DeleteCatalogIngredientButton({ ingredientId, displayName }: Props) {
  const router = useRouter();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const close = () => {
    setOpen(false);
    setError(null);
  };

  return (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="inline-flex items-center rounded-lg border border-destructive-border px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive-subtle disabled:opacity-60"
      >
        Удалить
      </button>

      <ConfirmActionDialog
        open={open}
        title="Удалить ингредиент?"
        description="Если ингредиент не используется, он будет удалён из каталога. Если на него есть ссылки в рецептах или на складе, он будет переведён в архив."
        confirmLabel="Удалить ингредиент"
        pendingLabel="Удаляем..."
        pending={isPending}
        error={error}
        onClose={close}
        onConfirm={() => {
          setError(null);
          startTransition(async () => {
            const response = await fetch(`/api/admin/ingredients/${ingredientId}`, {
              method: "DELETE"
            });

            const data = await response.json().catch(() => null) as
              | ({ error?: string } & Partial<DeleteIngredientResult>)
              | null;

            if (!response.ok) {
              const code = data?.error ?? "";
              setError(ERROR_MESSAGES[code] ?? "Не удалось удалить ингредиент.");
              return;
            }

            setOpen(false);
            show({
              title: data?.archived
                ? `«${displayName}» переведён в архив`
                : `«${displayName}» удалён из каталога`,
              description: data?.archived
                ? "Ингредиент используется в рецептах или на складе, поэтому он скрыт из каталога, а не удалён."
                : undefined,
              tone: "success"
            });
            router.refresh();
          });
        }}
      />
    </>
  );
}
