"use client";

import React, { useEffect, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";

import { countActiveRecipeFilters } from "@/features/recipes/recipes-url";
import type { RecipeStyleSearchIndex } from "@/features/recipes/style-search";

import { RecipesFilterControls } from "./recipes-filter-controls";
import { useRecipeQueryNav } from "./use-recipe-query";

/**
 * Мобильный bottom-sheet фильтров (по паттерну `bjcp-filter-sheet.tsx`): ручной
 * `role="dialog"`, Escape и overlay-close. Сам рендерит триггер-кнопку с бейджем
 * числа активных фильтров. Состояние open — локальное (UI-only, не в URL).
 */
export function RecipesFilterSheet({
  index,
  familyCounts
}: {
  index: RecipeStyleSearchIndex;
  familyCounts: Record<string, number>;
}) {
  const { searchParams } = useRecipeQueryNav();
  const [open, setOpen] = useState(false);
  const activeCount = countActiveRecipeFilters(new URLSearchParams(searchParams.toString()));

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        Фильтры
        {activeCount > 0 ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-950 px-1.5 text-[11px] font-semibold text-white">
            {activeCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/45 p-3"
          role="dialog"
          aria-modal="true"
          aria-label="Фильтры рецептов"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold text-zinc-950">Фильтры</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-950"
                aria-label="Закрыть фильтры"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <RecipesFilterControls index={index} familyCounts={familyCounts} />

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-6 w-full rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              Показать результаты
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
