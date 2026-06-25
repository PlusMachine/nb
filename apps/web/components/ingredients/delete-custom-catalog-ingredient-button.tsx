"use client";

import React from "react";
import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";

import { deleteCatalogCustomIngredientAction } from "@/app/(public)/catalog/actions";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";

type Props = {
  ingredientId: string;
  displayName: string;
  redirectHref?: string;
  label?: string;
  className?: string;
  variant?: "default" | "icon";
};

export function DeleteCustomCatalogIngredientButton({
  ingredientId,
  displayName,
  redirectHref,
  label = "Удалить",
  className,
  variant = "default"
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleOpen = () => setOpen(true);

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={isPending}
        onClick={handleOpen}
        aria-label={label}
        className={className ?? (variant === "icon"
          ? "rounded-md p-1 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-60"
          : "rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-60")}
      >
        {variant === "icon"
          ? <X className="h-4 w-4" />
          : (isPending ? "Удаляем..." : label)}
      </button>

      {feedback ? <p className={`text-xs ${feedback.ok ? "text-emerald-700" : "text-rose-600"}`}>{feedback.message}</p> : null}

      <ConfirmActionDialog
        open={open}
        title="Удалить ингредиент?"
        description={`Пользовательский ингредиент "${displayName}" будет удален из вашего каталога, если он не используется в рецептах или на складе.`}
        confirmLabel="Удалить ингредиент"
        pendingLabel="Удаляем..."
        pending={isPending}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          startTransition(async () => {
            const result = await deleteCatalogCustomIngredientAction(ingredientId);
            setFeedback(result);
            if (!result.ok) {
              return;
            }

            setOpen(false);
            if (redirectHref) {
              router.push(redirectHref);
              router.refresh();
              return;
            }

            router.replace(pathname, { scroll: false });
            router.refresh();
          });
        }}
      />
    </div>
  );
}
