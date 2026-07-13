"use client";

import React, { useState } from "react";
import { Copy } from "lucide-react";

import { cloneRecipeFromPublicAction } from "@/app/(public)/recipes/[slug]/clone-actions";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";

/**
 * Кнопка «Скопировать себе» — мост «сохранённое/публичное → мои рецепты». Создаёт
 * редактируемую копию (черновик) во владении пользователя и ведёт в редактор.
 * `variant="button"` — на детальной странице; `variant="icon"` — оверлей на
 * карточке (в `/app/saved`). Разлогинен → редирект на /login с возвратом.
 */
export function CloneFromPublicButton({
  recipeId,
  slug,
  variant = "button"
}: {
  recipeId: string;
  slug?: string;
  variant?: "button" | "icon";
}) {
  const [pending, setPending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClick = (event: React.MouseEvent) => {
    // Карточка обёрнута в ссылку — гасим переход/всплытие при клике по кнопке.
    event.preventDefault();
    event.stopPropagation();
    if (pending) {
      return;
    }

    setShowConfirm(true);
  };

  const handleConfirm = () => {
    setShowConfirm(false);
    setPending(true);
    void cloneRecipeFromPublicAction({ recipeId }).then((result) => {
      if (result.ok) {
        // Переход public → app-зона (другой layout) — полная навигация уместна.
        window.location.assign(`/app/recipes/${result.recipeId}/edit`);
        return;
      }
      setPending(false);
      if (result.code === "AUTH") {
        const next = slug ? `/recipes/${slug}` : "/recipes";
        window.location.assign(`/login?next=${encodeURIComponent(next)}`);
      }
    });
  };

  const dialog = (
    <ConfirmActionDialog
      open={showConfirm}
      onClose={() => setShowConfirm(false)}
      onConfirm={handleConfirm}
      title="Скопировать рецепт?"
      description="Рецепт попадёт в ваши рецепты как черновик, который вы сможете редактировать."
      confirmLabel="Скопировать"
      pendingLabel="Копируем…"
      tone="primary"
      pending={pending}
    />
  );

  if (variant === "icon") {
    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          disabled={pending}
          aria-label="Скопировать рецепт в «Мои рецепты»"
          // См. комментарий в recipe-save-button.tsx — тот же приём: визуальный бейдж
          // 28×28 (под ним рядом «Сохранить»), кликабельная зона растёт невидимым
          // before-псевдоэлементом до ~44×44.
          className="absolute right-2 top-11 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-card/70 text-muted-foreground backdrop-blur-sm transition before:absolute before:-inset-2 before:content-[''] hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
        </button>
        {dialog}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition hover:border-border disabled:opacity-60"
      >
        <Copy className="h-4 w-4" aria-hidden />
        {pending ? "Копируем…" : "Скопировать себе"}
      </button>
      {dialog}
    </>
  );
}
