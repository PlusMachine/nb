"use client";

import React, { useEffect, useRef, useState } from "react";
import { Timer } from "lucide-react";

import { Button } from "@nb/ui";
import { BrewPickerDialog } from "@/components/recipes/brew-picker-dialog";

/**
 * Первоклассный CTA «Сварить» на публичной странице рецепта — единый вход
 * (BrewPickerDialog): «Сварить самому» или «Сварить на автоматике». Работает с
 * любым доступным рецептом (своим любого статуса или чужим published) БЕЗ
 * клонирования в «Мои рецепты». Разлогинен → /login с возвратом на рецепт
 * (обрабатывается внутри диалога — автооткрытие для анонима просто повторяет
 * тот же путь, это ок).
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
  const autoOpenHandledRef = useRef(false);

  useEffect(() => {
    if (autoOpenHandledRef.current) return;
    autoOpenHandledRef.current = true;

    // Ф1 (P0 ревью): страница — статический документ, ?brew=1 (возврат с
    // /app/devices после подключения BrewForge) читаем ТОЛЬКО здесь, в эффекте,
    // из window.location — уже после гидрации. useSearchParams() в статическом
    // роуте требует Suspense-обёртку и вызывает CSR-bailout всей страницы;
    // чтение window.location в эффекте не влияет на статичность вообще.
    const params = new URLSearchParams(window.location.search);
    if (params.get("brew") !== "1") return;
    setOpen(true);

    // Стираем ?brew=1 без серверного round-trip (страница публичная и кэшируемая —
    // паттерн replaceRecipeEditorUrl/my-recipes-gallery.tsx): иначе повторный визит
    // на эту же ссылку/возврат назад переоткрывает диалог. Остальные query-параметры
    // и hash сохраняем как есть.
    params.delete("brew");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, []);

  return (
    <>
      <Button type="button" variant="brand" size="md" onClick={() => setOpen(true)}>
        <Timer className="h-4 w-4" aria-hidden />
        Сварить
      </Button>
      <BrewPickerDialog open={open} onOpenChange={setOpen} recipeId={recipeId} slug={slug} recipeTitle={recipeTitle} />
    </>
  );
}
