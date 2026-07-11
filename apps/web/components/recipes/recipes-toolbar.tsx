"use client";

import React, { useCallback } from "react";
import { Search } from "lucide-react";

import { Input } from "@nb/ui";

import type { PublicRecipeSort, PublicRecipeSortAvailability } from "@/features/recipes/contracts";
import { resolveVisibleSortOptions } from "@/features/recipes/recipes-url";
import { useDebouncedUrlSearch } from "@/components/shared/use-debounced-url-search";

import { useRecipeQueryNav } from "./use-recipe-query";

/**
 * Тулбар витрины: поиск (debounce → q, replace) и сортировка (нативный select →
 * sort, push). Состояние — только в URL. Счётчик результатов рендерит серверный
 * `RecipesResults` (там total). Пока идёт навигация (`isPending`) — ненавязчивый
 * индикатор «Обновляем…», чтобы выдача не «моргала» скелетоном на каждый тик фильтра.
 */
export function RecipesToolbar({ sortAvailability }: { sortAvailability: PublicRecipeSortAvailability }) {
  const { searchParams, navigate, buildHref, isPending } = useRecipeQueryNav();
  const urlQuery = searchParams.get("q") ?? "";
  const sort = (searchParams.get("sort") ?? "newest") as PublicRecipeSort;
  const sortOptions = resolveVisibleSortOptions(sortAvailability, sort);

  const buildSearchHref = useCallback(
    (nextQuery: string) => buildHref({ q: nextQuery || null }),
    [buildHref]
  );

  const {
    inputValue: searchValue,
    setInputValue: setSearchValue,
    isPending: isSearchPending
  } = useDebouncedUrlSearch({ value: urlQuery, buildHref: buildSearchHref });

  return (
    <div className="space-y-1.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <label htmlFor="recipes-search" className="sr-only">
            Поиск рецептов
          </label>
          <Input
            id="recipes-search"
            type="search"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Поиск по названию или автору"
            className="pl-9"
          />
        </div>

        <label className="sr-only">Сортировка</label>
        <select
          aria-label="Сортировка"
            value={sort}
            onChange={(event) => navigate({ sort: event.target.value })}
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
        </select>
      </div>

      {/* Постоянная строка фиксированной высоты — индикатор не двигает раскладку. */}
      <p className="h-4 text-xs text-muted-foreground" aria-live="polite">
        {isPending || isSearchPending ? "Обновляем…" : ""}
      </p>
    </div>
  );
}
