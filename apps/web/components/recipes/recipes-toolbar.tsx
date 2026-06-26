"use client";

import React, { useEffect, useState } from "react";
import { LayoutGrid, List, Search } from "lucide-react";

import { Input } from "@nb/ui";

import { recipeSortOptions } from "@/features/recipes/recipes-url";

import { useRecipeQueryNav } from "./use-recipe-query";

/**
 * Тулбар витрины: поиск (debounce → q, replace), сортировка (нативный select →
 * sort, push), переключатель grid/list (→ view, push без сброса page). Состояние —
 * только в URL. Счётчик результатов рендерит серверный `RecipesResults` (там total).
 * Пока идёт навигация (`isPending`) — ненавязчивый индикатор «Обновляем…», чтобы
 * выдача не «моргала» скелетоном на каждый тик фильтра.
 */
export function RecipesToolbar() {
  const { searchParams, navigate, isPending } = useRecipeQueryNav();
  const urlQuery = searchParams.get("q") ?? "";
  const sort = searchParams.get("sort") ?? "newest";
  const view = searchParams.get("view") ?? "grid";

  const [searchValue, setSearchValue] = useState(urlQuery);

  useEffect(() => {
    setSearchValue(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    const trimmed = searchValue.trim();
    if (trimmed === urlQuery.trim()) {
      return;
    }
    const timer = window.setTimeout(() => {
      navigate({ q: trimmed || null }, undefined, "replace");
    }, 250);
    return () => window.clearTimeout(timer);
  }, [navigate, searchValue, urlQuery]);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
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
            className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          >
            {recipeSortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
        </select>

        <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1" role="group" aria-label="Вид списка">
          <button
            type="button"
            aria-label="Сеткой"
            aria-pressed={view !== "list"}
            onClick={() => navigate({ view: null }, { resetPage: false })}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${
              view !== "list" ? "bg-zinc-950 text-white" : "text-zinc-500 hover:bg-zinc-100"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Списком"
            aria-pressed={view === "list"}
            onClick={() => navigate({ view: "list" }, { resetPage: false })}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${
              view === "list" ? "bg-zinc-950 text-white" : "text-zinc-500 hover:bg-zinc-100"
            }`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Постоянная строка фиксированной высоты — индикатор не двигает раскладку. */}
      <p className="h-4 text-xs text-zinc-400" aria-live="polite">
        {isPending ? "Обновляем…" : ""}
      </p>
    </div>
  );
}
