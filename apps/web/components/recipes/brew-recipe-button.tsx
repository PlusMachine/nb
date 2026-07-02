"use client";

import React, { useState } from "react";
import { Timer } from "lucide-react";

import { Button } from "@nb/ui";
import { BrewPickerDialog } from "@/components/recipes/brew-picker-dialog";

/**
 * Первоклассный CTA «Сварить» на публичной странице рецепта — единый вход
 * (BrewPickerDialog): «Сварить самому» или «Сварить на автоматике». Работает с
 * любым доступным рецептом (своим любого статуса или чужим published) БЕЗ
 * клонирования в «Мои рецепты». Разлогинен → /login с возвратом на рецепт
 * (обрабатывается внутри диалога).
 */
export function BrewRecipeButton({
  recipeId,
  slug,
  recipeTitle
}: {
  recipeId: string;
  slug: string;
  recipeTitle?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size="md" onClick={() => setOpen(true)}>
        <Timer className="h-4 w-4" aria-hidden />
        Сварить
      </Button>
      <BrewPickerDialog open={open} onOpenChange={setOpen} recipeId={recipeId} slug={slug} recipeTitle={recipeTitle} />
    </>
  );
}
