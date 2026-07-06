"use client";

import React from "react";

import type { RecipeStyleSearchIndex } from "@/features/recipes/style-search";

import { RecipesFilterControls } from "./recipes-filter-controls";

/**
 * Desktop-сайдбар фильтров (sticky). Виден только с `xl`: ниже — рядом с глобальным
 * nav-рельсом приложения — места на постоянный сайдбар не хватает, там работает sheet.
 */
export function RecipesFilterSidebar({
  index,
  familyCounts
}: {
  index: RecipeStyleSearchIndex;
  familyCounts: Record<string, number>;
}) {
  return (
    <aside className="hidden min-w-0 xl:block">
      <div className="sticky top-6 rounded-2xl border border-border bg-card p-5">
        <h2 className="sr-only">Фильтры</h2>
        <RecipesFilterControls index={index} familyCounts={familyCounts} />
      </div>
    </aside>
  );
}
