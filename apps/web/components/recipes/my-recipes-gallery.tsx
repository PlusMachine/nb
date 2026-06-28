"use client";

import React, { useMemo, useState } from "react";
import { LayoutGrid, List, Search } from "lucide-react";

import { Input } from "@nb/ui";

import type { OwnerRecipeCardDto, RecipePublicationState } from "@/features/recipes/contracts";

import { OwnerRecipeCard, OwnerRecipeRow } from "./owner-recipe-card";
import { RecipeMatchProvider } from "./recipe-match-provider";

/**
 * Галерея «Мои рецепты» — клиентская обёртка над уже загруженными карточками
 * ({@link OwnerRecipeCardDto}). Делает только фильтр/сортировку/переключение вида в
 * локальном стейте (данные грузятся целиком, серверная пагинация/URL-фильтры как на
 * `/recipes` тут избыточны). Полоса фильтров показывается только когда рецептов
 * заметно много ({@link TOOLBAR_THRESHOLD}); при малом числе остаётся лишь
 * переключатель grid/list.
 */

type ViewMode = "grid" | "list";
type StatusFilter = "all" | "published" | "private";
type SortMode = "updated" | "name" | "abv" | "ibu";

/** Порог, с которого появляется поиск/фильтр статуса/сортировка. */
const TOOLBAR_THRESHOLD = 6;

const sortOptions: { value: SortMode; label: string }[] = [
  { value: "updated", label: "Сначала недавние" },
  { value: "name", label: "По названию" },
  { value: "abv", label: "ABV ↓" },
  { value: "ibu", label: "IBU ↓" }
];

const matchesStatus = (state: RecipePublicationState, filter: StatusFilter): boolean => {
  if (filter === "all") {
    return true;
  }
  return filter === "published" ? state === "published" : state !== "published";
};

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (view: ViewMode) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1" role="group" aria-label="Вид списка">
      <button
        type="button"
        aria-label="Сеткой"
        aria-pressed={view === "grid"}
        onClick={() => onChange("grid")}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${
          view === "grid" ? "bg-zinc-950 text-white" : "text-zinc-500 hover:bg-zinc-100"
        }`}
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Списком"
        aria-pressed={view === "list"}
        onClick={() => onChange("list")}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${
          view === "list" ? "bg-zinc-950 text-white" : "text-zinc-500 hover:bg-zinc-100"
        }`}
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  );
}

export function MyRecipesGallery({ recipes }: { recipes: OwnerRecipeCardDto[] }) {
  const [view, setView] = useState<ViewMode>("grid");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortMode>("updated");

  const showToolbar = recipes.length > TOOLBAR_THRESHOLD;

  const statusCounts = useMemo(() => {
    let published = 0;
    for (const recipe of recipes) {
      if (recipe.publicationState === "published") {
        published += 1;
      }
    }
    return { all: recipes.length, published, private: recipes.length - published };
  }, [recipes]);

  const statusOptions: { value: StatusFilter; label: string; count: number }[] = [
    { value: "all", label: "Все", count: statusCounts.all },
    { value: "private", label: "Приватные", count: statusCounts.private },
    { value: "published", label: "Публичные", count: statusCounts.published }
  ];

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = recipes.filter((recipe) => {
      if (!matchesStatus(recipe.publicationState, status)) {
        return false;
      }
      if (needle === "") {
        return true;
      }
      return (
        recipe.title.toLowerCase().includes(needle) ||
        (recipe.styleName?.toLowerCase().includes(needle) ?? false)
      );
    });

    return [...filtered].sort((left, right) => {
      switch (sort) {
        case "name":
          return left.title.localeCompare(right.title, "ru");
        case "abv":
          return (right.abv ?? -Infinity) - (left.abv ?? -Infinity);
        case "ibu":
          return (right.ibu ?? -Infinity) - (left.ibu ?? -Infinity);
        default:
          return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      }
    });
  }, [recipes, query, status, sort]);

  return (
    <div className="space-y-4">
      {showToolbar ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
              <label htmlFor="my-recipes-search" className="sr-only">
                Поиск по рецептам
              </label>
              <Input
                id="my-recipes-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск по названию или стилю"
                className="pl-9"
              />
            </div>

            <label htmlFor="my-recipes-sort" className="sr-only">
              Сортировка
            </label>
            <select
              id="my-recipes-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortMode)}
              className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <ViewToggle view={view} onChange={setView} />
          </div>

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Фильтр по статусу">
            {statusOptions.map((option) => {
              const active = status === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStatus(option.value)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                    active
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  {option.label}
                  <span className={active ? "text-zinc-300" : "text-zinc-400"}>{option.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <ViewToggle view={view} onChange={setView} />
        </div>
      )}

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
          Ничего не найдено. Измените поиск или фильтр статуса.
        </p>
      ) : (
        <RecipeMatchProvider recipeIds={recipes.map((recipe) => recipe.id)}>
          {view === "list" ? (
            <div className="flex flex-col gap-3">
              {visible.map((recipe) => (
                <OwnerRecipeRow key={recipe.id} recipe={recipe} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((recipe) => (
                <OwnerRecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </div>
          )}
        </RecipeMatchProvider>
      )}
    </div>
  );
}
