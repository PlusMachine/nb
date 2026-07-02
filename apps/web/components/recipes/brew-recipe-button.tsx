"use client";

import React, { useState } from "react";
import { Timer } from "lucide-react";

import { startBrewFromRecipeAction } from "@/app/(public)/recipes/[slug]/brew-actions";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";

/**
 * Первоклассный CTA «Сварить» на публичной странице рецепта. Создаёт партию варки
 * напрямую из рецепта (своего любого статуса или чужого published) БЕЗ
 * клонирования в «Мои рецепты» и ведёт на страницу партии. Разлогинен → /login с
 * возвратом на рецепт.
 */
export function BrewRecipeButton({ recipeId, slug }: { recipeId: string; slug: string }) {
  const [pending, setPending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = () => {
    setShowConfirm(false);
    setError(null);
    setPending(true);
    void startBrewFromRecipeAction({ recipeId }).then((result) => {
      if (result.ok) {
        // public → app-зона (другой layout) — полная навигация уместна.
        window.location.assign(`/app/brew-batches/${result.brewBatchId}`);
        return;
      }
      setPending(false);
      if (result.code === "AUTH") {
        window.location.assign(`/login?next=${encodeURIComponent(`/recipes/${slug}`)}`);
        return;
      }
      setError(result.message);
    });
  };

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => !pending && setShowConfirm(true)}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-60"
        >
          <Timer className="h-4 w-4" aria-hidden />
          {pending ? "Готовим…" : "Сварить"}
        </button>
        {error ? <span className="text-xs text-rose-600">{error}</span> : null}
      </div>
      <ConfirmActionDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleConfirm}
        title="Начать варку по этому рецепту?"
        description="Будет создана партия варки в вашем плане. Рецепт останется у автора — копия в «Мои рецепты» не создаётся."
        confirmLabel="Сварить"
        pendingLabel="Готовим…"
        tone="primary"
        pending={pending}
      />
    </>
  );
}
