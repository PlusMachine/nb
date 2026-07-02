"use client";

import React, { useState } from "react";
import { Beer } from "lucide-react";

import { BrewPickerDialog } from "@/components/recipes/brew-picker-dialog";

/**
 * CTA «Сварить» на карточке «рецепт под ваш склад» — виден, когда на складе есть
 * все ингредиенты. Единый вход (BrewPickerDialog): «Сварить самому» или «Сварить
 * на автоматике», с любым доступным рецептом (своим или чужим published) БЕЗ
 * клонирования в «Мои рецепты».
 *
 * Карточка — stretched-link на `/recipes/[slug]`, поэтому гасим переход/всплытие
 * и поднимаем кнопку над ссылкой (`pointer-events-auto` + `z-10`).
 */
export function BrewFromStockButton({
  recipeId,
  slug,
  recipeTitle
}: {
  recipeId: string;
  slug: string;
  recipeTitle?: string | null;
}) {
  const [open, setOpen] = useState(false);

  const handleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  };

  return (
    <span className="pointer-events-auto relative z-10 flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
      >
        <Beer className="h-4 w-4" aria-hidden />
        Сварить
      </button>
      <BrewPickerDialog open={open} onOpenChange={setOpen} recipeId={recipeId} slug={slug} recipeTitle={recipeTitle} />
    </span>
  );
}
