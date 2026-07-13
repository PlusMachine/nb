"use client";

import React, { useState } from "react";
import { Check, Search, X } from "lucide-react";

import {
  findStyleByCode,
  orderedFamiliesWithCounts,
  searchRecipeStyles,
  type RecipeStyleSearchIndex
} from "@/features/recipes/style-search";

import { useRecipeQueryNav } from "./use-recipe-query";

/**
 * Фильтр по стилю — два раздельных блока (без вложенности):
 *  1. «Поиск стиля» — всегда видимое поле фаззи-поиска; выпадающий список
 *     совпадений ровными строками в одном листбоксе; выбор ставит `style=`.
 *  2. «Семейство» — ровный список во всю ширину; выбор ставит `family=`.
 * Семейство и стиль взаимоисключающи (оба ведут в `resolveStyleScope`): выбор
 * одного очищает другой. Контракт URL/SQL не меняется.
 */
export function RecipeStylePicker({
  index,
  familyCounts
}: {
  index: RecipeStyleSearchIndex;
  familyCounts: Record<string, number>;
}) {
  const { searchParams, navigate } = useRecipeQueryNav();
  const family = searchParams.get("family");
  const style = searchParams.get("style");

  const [query, setQuery] = useState("");

  // Только непустые семейства (с рецептами на витрине), с числом рецептов.
  const families = orderedFamiliesWithCounts(index, familyCounts);
  const trimmed = query.trim();
  const showResults = trimmed.length >= 2;
  const results = showResults ? searchRecipeStyles(query, index).styles : [];
  const selectedStyle = findStyleByCode(index, style);

  const pickFamily = (id: string | null) => navigate({ family: id, style: null });
  const pickStyle = (code: string) => {
    navigate({ style: code, family: null });
    setQuery("");
  };

  return (
    <div className="space-y-6">
      <div className="min-w-0 space-y-2">
        <span className="text-sm font-semibold text-foreground">Поиск стиля</span>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 focus-within:ring-2 focus-within:ring-ring">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Название или код, напр. American IPA"
            aria-label="Поиск стиля"
            className="h-10 w-full min-w-0 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none sm:text-sm"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Очистить поиск"
              className="shrink-0 text-muted-foreground transition hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>

        {showResults ? (
          <div className="max-h-64 overflow-y-auto rounded-lg border border-border" role="listbox">
            {results.length ? (
              results.map((entry) => {
                const selected = style === entry.code;
                return (
                  <button
                    key={entry.code}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => pickStyle(entry.code)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-foreground transition hover:bg-accent"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-foreground">{entry.code}</span>
                      {" · "}
                      {entry.title}
                    </span>
                    {selected ? <Check className="h-4 w-4 shrink-0 text-foreground" aria-hidden /> : null}
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-2.5 text-sm text-muted-foreground">Ничего не найдено</p>
            )}
          </div>
        ) : selectedStyle ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-foreground bg-foreground px-3 py-2 text-sm text-background">
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{selectedStyle.code}</span>
              {" · "}
              {selectedStyle.title}
            </span>
            <button
              type="button"
              onClick={() => navigate({ style: null })}
              aria-label="Убрать стиль"
              className="shrink-0 text-background/70 transition hover:text-background"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      <fieldset className="min-w-0 space-y-2">
        <legend className="text-sm font-semibold text-foreground">Семейство</legend>
        <div className="space-y-1.5">
          <FamilyRow label="Все семейства" active={!family && !style} onClick={() => pickFamily(null)} />
          {families.map((entry) => (
            <FamilyRow
              key={entry.id}
              label={entry.nameRu}
              count={entry.recipeCount}
              active={family === entry.id}
              onClick={() => pickFamily(family === entry.id ? null : entry.id)}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/** Строка семейства во всю ширину; усечение длинных названий внутри сайдбара. */
function FamilyRow({
  label,
  count,
  active,
  onClick
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-foreground hover:border-border hover:bg-muted"
      }`}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      {count != null ? (
        <span
          className={`shrink-0 text-xs font-medium tabular-nums ${active ? "text-background/70" : "text-muted-foreground"}`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
