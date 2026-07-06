"use client";

import React, { useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button, Sheet } from "@nb/ui";
import { countActiveRecipeFilters } from "@/features/recipes/recipes-url";
import type { RecipeStyleSearchIndex } from "@/features/recipes/style-search";

import { RecipesFilterControls } from "./recipes-filter-controls";
import { useRecipeQueryNav } from "./use-recipe-query";

/**
 * Мобильный bottom-sheet фильтров. Сам рендерит триггер-кнопку с бейджем числа
 * активных фильтров. Состояние open — локальное (UI-only, не в URL).
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

  return (
    <div className="xl:hidden">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Открыть фильтры"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        {activeCount > 0 ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-[11px] font-semibold text-background">
            {activeCount}
          </span>
        ) : null}
      </Button>

      <Sheet open={open} onOpenChange={setOpen} title="Фильтры" side="bottom">
        <RecipesFilterControls index={index} familyCounts={familyCounts} />

        <Button type="button" size="md" className="mt-6 w-full" onClick={() => setOpen(false)}>
          Показать результаты
        </Button>
      </Sheet>
    </div>
  );
}
