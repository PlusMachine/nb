"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useToast } from "@nb/ui";

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
        aria-label={label}
        className={className ?? (variant === "icon"
          // before:-inset-2.5 расширяет тач-таргет до ~44px, не увеличивая саму иконку
          // (тот же приём, что в recipe-save-button.tsx / clone-from-public-button.tsx).
          ? "relative rounded-md p-1 text-muted-foreground transition-colors before:absolute before:-inset-2.5 before:content-[''] hover:bg-destructive-subtle hover:text-destructive disabled:opacity-60"
          : "rounded-xl border border-destructive-border bg-card px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive-subtle disabled:opacity-60")}
      >
        {variant === "icon"
          ? <X className="h-4 w-4" />
          : (isPending ? "Удаляем..." : label)}
      </button>

      <ConfirmActionDialog
        open={open}
        title="Удалить ингредиент?"
        description={`Пользовательский ингредиент «${displayName}» будет удалён из вашего каталога, если он не используется в рецептах или на складе.`}
        confirmLabel="Удалить ингредиент"
        pendingLabel="Удаляем..."
        pending={isPending}
        error={error}
        onClose={close}
        onConfirm={() => {
          setError(null);
          startTransition(async () => {
            const result = await deleteCatalogCustomIngredientAction(ingredientId);
            if (!result.ok) {
              setError(result.message);
              return;
            }

            setOpen(false);
            show({ title: `«${displayName}» удалён`, tone: "success" });

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
    </>
  );
}
