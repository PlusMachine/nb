"use client";

import React from "react";
import { useEffect, useMemo, useState } from "react";

import type { IngredientSuggestionItem, IngredientType } from "@/features/ingredients/contracts";

type Props = {
  value?: string;
  type?: IngredientType;
  onSelect: (item: IngredientSuggestionItem) => void;
  placeholder?: string;
  emptyCta?: React.ReactNode;
  searchIngredients?: (params: { q: string; type?: IngredientType; limit: number; signal: AbortSignal }) => Promise<IngredientSuggestionItem[]>;
};

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

const defaultSearchIngredients = async ({ q, type, limit, signal }: { q: string; type?: IngredientType; limit: number; signal: AbortSignal }) => {
  const params = new URLSearchParams({ q, limit: String(limit) });
  if (type) {
    params.set("type", type);
  }
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
  onSelect,
  placeholder = "Search ingredient",
  emptyCta,
  searchIngredients = defaultSearchIngredients
}: Props) => {
  const [query, setQuery] = useState(value ?? "");
  const [items, setItems] = useState<IngredientSuggestionItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      if (!query.trim()) {
        setItems([]);
        return;
      }

      try {
        const nextItems = await searchIngredients({ q: query, type, limit: 8, signal: controller.signal });
        if (controller.signal.aborted) {
          return;
        }
        setItems(nextItems);
        setActiveIndex(0);
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
  }, [query, searchIngredients, type]);

  const grouped = useMemo(() => {
    return items.reduce<Record<string, IngredientSuggestionItem[]>>((acc, item) => {
      acc[item.type] ??= [];
      acc[item.type].push(item);
      return acc;
    }, {});
  }, [items]);

  return (
    <div className="space-y-2">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-zinc-200 px-3 text-sm"
        onKeyDown={(event) => {
          if (!items.length) return;
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
              onSelect(active);
            }
          }
        }}
      />
      {!!items.length && (
        <div className="rounded-md border bg-white">
          {Object.entries(grouped).map(([group, groupItems]) => (
            <div key={group} className="border-b last:border-b-0">
              <div className="bg-zinc-50 px-3 py-1 text-xs uppercase text-zinc-500">{group}</div>
              {groupItems.map((item) => {
                const idx = items.findIndex((candidate) => candidate.id === item.id);
                return (
                  <button
                    key={item.id}
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 ${idx === activeIndex ? "bg-zinc-100" : ""}`}
                    onClick={() => onSelect(item)}
                    type="button"
                  >
                    <div className="font-medium">{item.displayName}</div>
                    {item.subtitle && <div className="text-xs text-zinc-500">{item.subtitle}</div>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {!items.length && query.trim() && emptyCta}
    </div>
  );
};
