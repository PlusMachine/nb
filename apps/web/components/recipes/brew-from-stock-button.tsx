"use client";

import React, { useState } from "react";
import { Beer, Loader2 } from "lucide-react";

import { startBrewFromRecipeAction } from "@/app/(public)/recipes/[slug]/brew-actions";

/**
 * CTA «Сварить» на карточке «рецепт под ваш склад» — виден, когда на складе есть
 * все ингредиенты. Создаёт партию варки напрямую из рецепта (своего или чужого
 * published) БЕЗ клонирования в «Мои рецепты» и ведёт на страницу партии, где
 * можно списать ингредиенты со склада.
 *
 * Карточка — stretched-link на `/recipes/[slug]`, поэтому гасим переход/всплытие
 * и поднимаем кнопку над ссылкой (`pointer-events-auto` + `z-10`).
 */
export function BrewFromStockButton({ recipeId, slug }: { recipeId: string; slug: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (pending) {
      return;
    }
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
    <span className="pointer-events-auto relative z-10 flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Beer className="h-4 w-4" aria-hidden />}
        {pending ? "Готовим…" : "Сварить"}
      </button>
      {error ? <span className="text-center text-xs text-rose-600">{error}</span> : null}
    </span>
  );
}
