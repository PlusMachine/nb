"use client";

import React from "react";
import { useEffect, useId, useMemo, useState } from "react";

import type {
  IngredientCategory,
  IngredientSuggestionItem,
  IngredientType
} from "@/features/ingredients/contracts";
import { ingredientCategoryLabels } from "@/features/ingredients/presentation";

type Props = {
  value?: string;
  type?: IngredientType;
  category?: IngredientCategory;
  onSelect: (item: IngredientSuggestionItem) => void;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  emptyCta?: React.ReactNode;
  searchIngredients?: (params: {
    q: string;
    type?: IngredientType;
    category?: IngredientCategory;
    limit: number;
    signal: AbortSignal;
  }) => Promise<IngredientSuggestionItem[]>;
};

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

export const shouldSearchIngredients = ({ isOpen, query }: { isOpen: boolean; query: string }) => (
  isOpen && Boolean(query.trim())
);

export const shouldShowIngredientSuggestions = ({ isOpen, itemsCount }: { isOpen: boolean; itemsCount: number }) => (
  isOpen && itemsCount > 0
);

export const shouldShowIngredientEmptyState = ({
  hasResolvedQuery,
  isLoading,
  isOpen,
  itemsCount,
  query
}: {
  hasResolvedQuery: boolean;
  isLoading: boolean;
  isOpen: boolean;
  itemsCount: number;
  query: string;
}) => (
  isOpen
  && Boolean(query.trim())
  && !isLoading
  && hasResolvedQuery
  && itemsCount === 0
);

export const buildIngredientSearchParams = ({
  q,
  type,
  category,
  limit
}: {
  q: string;
  type?: IngredientType;
  category?: IngredientCategory;
  limit: number;
}) => {
  const params = new URLSearchParams({ q: q.trim(), limit: String(limit) });
  if (type) {
    params.set("type", type);
  }
  if (category) {
    params.set("category", category);
  }

  return params;
};

const defaultSearchIngredients = async ({
  q,
  type,
  category,
  limit,
  signal
}: {
  q: string;
  type?: IngredientType;
  category?: IngredientCategory;
  limit: number;
  signal: AbortSignal;
}) => {
  const params = buildIngredientSearchParams({ q, type, category, limit });
  const response = await fetch(`/api/ingredients/search?${params.toString()}`, { signal });
  if (!response.ok) {
    return [];
  }
  const data = await response.json() as { items: IngredientSuggestionItem[] };
  return data.items;
};

export const IngredientPicker = ({
  value,
  type,
  category,
  onSelect,
  onValueChange,
  placeholder = "Search ingredient",
  emptyCta,
  searchIngredients = defaultSearchIngredients
}: Props) => {
  const [query, setQuery] = useState(value ?? "");
  const [items, setItems] = useState<IngredientSuggestionItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasResolvedQuery, setHasResolvedQuery] = useState(false);
  const listboxId = useId();

  useEffect(() => {
    setQuery(value ?? "");
    setIsOpen((current) => current && Boolean((value ?? "").trim()));
  }, [value]);

  useEffect(() => {
    if (!shouldSearchIngredients({ isOpen, query })) {
      setItems([]);
      setActiveIndex(0);
      setIsLoading(false);
      setHasResolvedQuery(false);
      return;
    }

    const controller = new AbortController();
    const run = async () => {
      try {
        setIsLoading(true);
        setHasResolvedQuery(false);
        const nextItems = await searchIngredients({ q: query, type, category, limit: 8, signal: controller.signal });
        if (controller.signal.aborted) {
          return;
        }
        setItems(nextItems);
        setActiveIndex(0);
        setIsLoading(false);
        setHasResolvedQuery(true);
      } catch (error) {
        if (isAbortError(error) || controller.signal.aborted) {
          return;
        }
        throw error;
      }
    };

    const timer = setTimeout(() => {
      void run();
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [category, isOpen, query, searchIngredients, type]);

  const grouped = useMemo(() => {
    return items.reduce<Record<string, IngredientSuggestionItem[]>>((acc, item) => {
      const groupKey = item.category ?? item.type;
      acc[groupKey] ??= [];
      acc[groupKey].push(item);
      return acc;
    }, {});
  }, [items]);

  const showGroupHeaders = !category && Object.keys(grouped).length > 1;

  const commitSelection = (item: IngredientSuggestionItem) => {
    setIsOpen(false);
    setItems([]);
    setActiveIndex(0);
    setIsLoading(false);
    setHasResolvedQuery(false);
    onSelect(item);
  };

  const showSuggestions = shouldShowIngredientSuggestions({ isOpen, itemsCount: items.length });
  const showEmptyState = shouldShowIngredientEmptyState({
    hasResolvedQuery,
    isLoading,
    isOpen,
    itemsCount: items.length,
    query
  });

  return (
    <div className="space-y-2">
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(Boolean(event.target.value.trim()));
          setHasResolvedQuery(false);
          onValueChange?.(event.target.value);
        }}
        onFocus={() => setIsOpen(Boolean(query.trim()))}
        onBlur={() => setIsOpen(false)}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-zinc-200 px-3 text-sm"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={showSuggestions ? listboxId : undefined}
        aria-autocomplete="list"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false);
            return;
          }
          if (!showSuggestions) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, items.length - 1));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          }
          if (event.key === "Enter") {
            event.preventDefault();
            const active = items[activeIndex];
            if (active) {
              commitSelection(active);
            }
          }
        }}
      />
      {isLoading && isOpen && query.trim() ? (
        <p className="text-xs text-zinc-500">Ищем ингредиенты...</p>
      ) : null}
      {showSuggestions && (
        <div id={listboxId} role="listbox" className="rounded-md border bg-white">
          {Object.entries(grouped).map(([group, groupItems]) => (
            <div key={group} className="border-b last:border-b-0">
              {showGroupHeaders ? (
                <div className="bg-zinc-50 px-3 py-1 text-xs uppercase text-zinc-500">
                  {ingredientCategoryLabels[group as IngredientCategory] ?? group}
                </div>
              ) : null}
              {groupItems.map((item) => {
                const idx = items.findIndex((candidate) => candidate.id === item.id);
                const metaLine = [item.familyDisplayName, item.subtitle]
                  .filter((part) => Boolean(part) && part !== item.displayName)
                  .join(" • ");

                return (
                  <button
                    key={item.id}
                    role="option"
                    aria-selected={idx === activeIndex}
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 ${idx === activeIndex ? "bg-zinc-100" : ""}`}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => commitSelection(item)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium">{item.displayName}</div>
                        {metaLine ? <div className="text-xs text-zinc-500">{metaLine}</div> : null}
                      </div>
                      {item.brandName ?? item.manufacturer ? (
                        <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">
                          {item.brandName ?? item.manufacturer}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {showEmptyState && emptyCta}
    </div>
  );
};
