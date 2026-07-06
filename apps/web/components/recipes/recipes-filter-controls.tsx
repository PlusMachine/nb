"use client";

import React from "react";

import { abvBound, ibuBound } from "@/features/recipes/range-slider";
import type { RecipeStyleSearchIndex } from "@/features/recipes/style-search";

import { RecipeStylePicker } from "./recipe-style-picker";
import { RecipesColorScale } from "./recipes-color-scale";
import { RecipesRangeSlider } from "./recipes-range-slider";
import { useRecipeQueryNav } from "./use-recipe-query";

// Опции для активных чипов (`active-filter-chips`) — лейблы семейства/стиля.
export type RecipeFamilyOption = { id: string; name: string };
export type RecipeStyleOption = { code: string; name: string; familyIds: string[] };

/**
 * Общий контент панели фильтров (переиспользуется desktop-сайдбаром и мобильным
 * sheet). Всё состояние — в URL. Контролы:
 *  - стиль/семейство → умный пикер с поиском ({@link RecipeStylePicker});
 *  - цвет → кликабельная градиентная шкала ({@link RecipesColorScale});
 *  - ABV/IBU → диапазонные слайдеры ({@link RecipesRangeSlider}).
 * Доменной логики нет — поисковый индекс приходит пропсом с сервера.
 */
export function RecipesFilterControls({
  index,
  familyCounts
}: {
  index: RecipeStyleSearchIndex;
  familyCounts: Record<string, number>;
}) {
  const { reset } = useRecipeQueryNav();

  return (
    <div className="space-y-6">
      <RecipeStylePicker index={index} familyCounts={familyCounts} />

      <RecipesColorScale />

      <RecipesRangeSlider label="ABV" unit="%" minKey="abvMin" maxKey="abvMax" bound={abvBound} />
      <RecipesRangeSlider label="IBU" minKey="ibuMin" maxKey="ibuMax" bound={ibuBound} />

      <button
        type="button"
        onClick={reset}
        className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted"
      >
        Сбросить фильтры
      </button>
    </div>
  );
}
