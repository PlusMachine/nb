"use client";

import React, { useCallback } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, List, Search } from "lucide-react";

import { Input } from "@nb/ui";

import type { PublicRecipeSort, PublicRecipeSortAvailability } from "@/features/recipes/contracts";
import { RECIPES_VIEW_COOKIE, resolveVisibleSortOptions, type RecipesView } from "@/features/recipes/recipes-url";
import { useDebouncedUrlSearch } from "@/components/shared/use-debounced-url-search";

import { useRecipeQueryNav } from "./use-recipe-query";

/**
 * Тулбар витрины: поиск (debounce → q, replace), сортировка (нативный select →
 * sort, push), переключатель grid/list (→ view, push без сброса page). Состояние —
 * только в URL. Счётчик результатов рендерит серверный `RecipesResults` (там total).
 * Пока идёт навигация (`isPending`) — ненавязчивый индикатор «Обновляем…», чтобы
 * выдача не «моргала» скелетоном на каждый тик фильтра.
 */
export function RecipesToolbar({
  defaultView = "grid",
  sortAvailability
}: {
  defaultView?: RecipesView;
  sortAvailability: PublicRecipeSortAvailability;
}) {
  const { searchParams, navigate, buildHref, isPending } = useRecipeQueryNav();
  const router = useRouter();
  const urlQuery = searchParams.get("q") ?? "";
  const sort = (searchParams.get("sort") ?? "newest") as PublicRecipeSort;
  const view = searchParams.get("view") ?? defaultView;
  const sortOptions = resolveVisibleSortOptions(sortAvailability, sort);

  // Запоминаем выбор вида в cookie — серверная страница подставит его дефолтом при
  // следующем заходе без явного ?view. «Сетка» вырезается из URL как дефолт, поэтому
  // если целевой адрес не меняется (переключение на сетку из «чистого» URL при
  // cookie=list) — форсим серверный ре-рендер, чтобы он перечитал cookie.
  const selectView = (next: RecipesView) => {
    document.cookie = `${RECIPES_VIEW_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    const patch: Record<string, string | null> = { view: next === "grid" ? null : "list" };
    if (buildHref(patch, { resetPage: false }) === buildHref({}, { resetPage: false })) {
      router.refresh();
    } else {
      navigate(patch, { resetPage: false });
    }
  };

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

        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1" role="group" aria-label="Вид списка">
          <button
            type="button"
            aria-label="Сеткой"
            aria-pressed={view !== "list"}
            onClick={() => selectView("grid")}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${
              view !== "list" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Списком"
            aria-pressed={view === "list"}
            onClick={() => selectView("list")}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${
              view === "list" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Постоянная строка фиксированной высоты — индикатор не двигает раскладку. */}
      <p className="h-4 text-xs text-muted-foreground" aria-live="polite">
        {isPending || isSearchPending ? "Обновляем…" : ""}
      </p>
    </div>
  );
}
