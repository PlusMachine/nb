"use client";

import React, { useEffect, useState, useTransition } from "react";
import { Bookmark } from "lucide-react";

import { loadRecipeSaveViewerState, toggleRecipeSaveAction } from "@/app/(public)/recipes/save-actions";

import { useRecipeSaves } from "./recipe-saves-provider";

/**
 * Кнопка «Сохранить» рецепт в «Избранное». На витрине (`variant="icon"`) — флажок
 * в углу карточки, состояние берётся из {@link RecipeSavesProvider}. На детальной
 * странице (`variant="button"`) провайдера нет — состояние грузится после гидрации
 * через server action, чтобы документ оставался кэшируемым. userId — только на сервере.
 */
export function RecipeSaveButton({
  recipeId,
  slug,
  variant = "icon"
}: {
  recipeId: string;
  slug?: string;
  variant?: "icon" | "button";
}) {
  const ctx = useRecipeSaves();
  const [standaloneSaved, setStandaloneSaved] = useState<boolean | null>(null);
  const [isPending, startTransition] = useTransition();

  // Детальная страница (без провайдера): тянем своё состояние после гидрации.
  useEffect(() => {
    if (ctx) {
      return;
    }
    let active = true;
    loadRecipeSaveViewerState(recipeId)
      .then((state) => {
        if (active) {
          setStandaloneSaved(state.saved);
        }
      })
      .catch(() => {
        if (active) {
          setStandaloneSaved(false);
        }
      });
    return () => {
      active = false;
    };
  }, [ctx, recipeId]);

  const saved = ctx ? ctx.isSaved(recipeId) : standaloneSaved ?? false;

  const applyOptimistic = (next: boolean) => {
    if (ctx) {
      ctx.setSaved(recipeId, next);
    } else {
      setStandaloneSaved(next);
    }
  };

  const toggle = (event: React.MouseEvent) => {
    // Карточка обёрнута в ссылку — гасим переход/всплытие при клике по флажку.
    event.preventDefault();
    event.stopPropagation();

    const next = !saved;
    applyOptimistic(next);

    startTransition(async () => {
      const result = await toggleRecipeSaveAction({ recipeId, slug, next });
      if (!result.ok) {
        applyOptimistic(!next); // откат оптимистичного апдейта
        if (result.code === "AUTH") {
          window.location.assign("/login");
        }
      }
    });
  };

  const label = saved ? "Убрать из избранного" : "Сохранить в избранное";

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={saved}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${
          saved
            ? "border-amber-300 bg-amber-50 text-amber-700"
            : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
        }`}
      >
        <Bookmark className={saved ? "h-4 w-4 fill-amber-500 text-amber-500" : "h-4 w-4"} aria-hidden />
        {saved ? "Сохранено" : "Сохранить"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      aria-label={label}
      aria-pressed={saved}
      className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-zinc-600 backdrop-blur-sm transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-60"
    >
      <Bookmark className={saved ? "h-3.5 w-3.5 fill-amber-500 text-amber-500" : "h-3.5 w-3.5"} aria-hidden />
    </button>
  );
}
