"use client";

import React from "react";

import type { RecipeStyleSearchIndex } from "@/features/recipes/style-search";

import { RecipesFilterControls } from "./recipes-filter-controls";

/** Desktop-сайдбар фильтров (sticky). На мобильных скрыт — там используется sheet. */
export function RecipesFilterSidebar({
  index,
  familyCounts
}: {
  index: RecipeStyleSearchIndex;
  familyCounts: Record<string, number>;
}) {
  return (
    <aside className="hidden min-w-0 lg:block">
      <div className="sticky top-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="sr-only">Фильтры</h2>
        <RecipesFilterControls index={index} familyCounts={familyCounts} />
      </div>
    </aside>
  );
}
