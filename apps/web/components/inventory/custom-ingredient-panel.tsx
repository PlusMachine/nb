"use client";

import React from "react";
import { useDeferredValue, useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";

import type {
  IngredientCatalogSortOption,
  IngredientCategory,
  IngredientSuggestionItem,
  IngredientSubtype
} from "@/features/ingredients/contracts";
import {
  buildIngredientTypedSummary,
  resolveIngredientBrandLabel,
  resolveIngredientCountry,
  resolveIngredientDisplayNames
} from "@/features/ingredients/presentation";
import type { SystemCurrency } from "@/features/system/currency";

import { CatalogIngredientForm, type CatalogIngredientSubmitPayload } from "./catalog-ingredient-form";
import { CustomIngredientForm, type CustomIngredientSubmitPayload } from "./custom-ingredient-form";

type Props = {
  category: IngredientCategory;
  initialSubtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  preferredCurrency: SystemCurrency;
  pending: boolean;
  fieldErrors?: Record<string, string>;
  onSubmitCreate: (payload: CustomIngredientSubmitPayload) => Promise<void>;
  onSubmitExisting: (payload: CatalogIngredientSubmitPayload) => Promise<void>;
  selectionActionLabel?: string;
  onSelectedIngredientChange?: (selected: IngredientSuggestionItem | null) => void;
};

type BrowserResponse = {
  items: IngredientSuggestionItem[];
  total: number;
  error?: string;
};

const sortLabels: Record<IngredientCatalogSortOption, string> = {
  name: "По названию",
  updated: "Сначала новые",
  category: "По категории",
  brand: "По бренду"
};

const availableSortOptions: IngredientCatalogSortOption[] = ["updated", "name", "brand"];

const buildBrowserRequestUrl = ({
  q,
  category,
  subtype,
  sort
}: {
  q: string;
  category: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  sort: IngredientCatalogSortOption;
}) => {
  const params = new URLSearchParams({
    category,
    sort,
    limit: "30"
  });

  if (q.trim()) {
    params.set("q", q.trim());
  }

  if (subtype) {
    params.set("subtype", subtype);
  }

  return `/api/ingredients/custom?${params.toString()}`;
};

export function CustomIngredientPanel({
  category,
  initialSubtype = null,
  preferredCurrency,
  pending,
  fieldErrors,
  onSubmitCreate,
  onSubmitExisting,
  selectionActionLabel = "Изменить ингредиент",
  onSelectedIngredientChange
}: Props) {
  const [mode, setMode] = useState<"browse" | "create">("browse");
  const [selectedItem, setSelectedItem] = useState<IngredientSuggestionItem | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<IngredientCatalogSortOption>("updated");
  const [items, setItems] = useState<IngredientSuggestionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMode("browse");
    setSelectedItem(null);
    setQuery("");
    setSort("updated");
    setItems([]);
    setTotal(0);
    setError(null);
  }, [category, initialSubtype]);

  useEffect(() => {
    onSelectedIngredientChange?.(selectedItem);
  }, [onSelectedIngredientChange, selectedItem]);

  useEffect(() => {
    if (mode !== "browse" || selectedItem) {
      return;
    }

    const controller = new AbortController();
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(buildBrowserRequestUrl({
          q: deferredQuery,
          category,
          subtype: initialSubtype,
          sort
        }), {
          signal: controller.signal
        });

        const data = await response.json() as BrowserResponse;
        if (!response.ok) {
          throw new Error(data.error ?? "Не удалось загрузить пользовательские ингредиенты.");
        }

        if (controller.signal.aborted) {
          return;
        }

        setItems(data.items);
        setTotal(data.total);
      } catch (nextError) {
        if (controller.signal.aborted) {
          return;
        }

        setItems([]);
        setTotal(0);
        setError((nextError as Error).message);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => controller.abort();
  }, [category, deferredQuery, initialSubtype, mode, selectedItem, sort]);

  if (mode === "create") {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setMode("browse")}
          className="inline-flex items-center gap-2 text-sm text-zinc-600 transition-colors hover:text-zinc-900"
        >
          <ArrowLeft className="h-4 w-4" />
          К списку своих ингредиентов
        </button>

        <CustomIngredientForm
          category={category}
          initialSubtype={initialSubtype}
          preferredCurrency={preferredCurrency}
          pending={pending}
          fieldErrors={fieldErrors}
          onSubmit={onSubmitCreate}
        />
      </div>
    );
  }

  if (selectedItem) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSelectedItem(null)}
          className="inline-flex items-center gap-2 text-sm text-zinc-600 transition-colors hover:text-zinc-900"
        >
          <ArrowLeft className="h-4 w-4" />
          К списку своих ингредиентов
        </button>

        <CatalogIngredientForm
          category={category}
          subtype={initialSubtype}
          preferredCurrency={preferredCurrency}
          pending={pending}
          initialSelection={selectedItem}
          fieldErrors={fieldErrors}
          hidePicker
          selectionActionLabel={selectionActionLabel}
          onSelectionCleared={() => setSelectedItem(null)}
          onRequestCustom={() => setMode("create")}
          onSubmit={onSubmitExisting}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="custom-ingredient-browser">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск среди своих ингредиентов"
          className="h-10 flex-1 rounded-md border border-zinc-200 px-3 text-sm"
          data-testid="custom-ingredient-browser-search"
        />

        <div className="flex gap-2 sm:w-auto">
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as IngredientCatalogSortOption)}
            className="h-10 min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-3 text-sm sm:w-44"
            data-testid="custom-ingredient-browser-sort"
          >
            {availableSortOptions.map((option) => (
              <option key={option} value={option}>{sortLabels[option]}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setMode("create")}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-zinc-950 px-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            <Plus className="h-4 w-4" />
            Добавить новый
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>Свои ингредиенты</span>
        <span>{loading ? "Загрузка..." : `${total} шт.`}</span>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!error && !loading && items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center">
          <p className="text-sm text-zinc-700">
            {deferredQuery.trim() ? "Ничего не найдено в ваших ингредиентах." : "В этой категории пока нет своих ингредиентов."}
          </p>
          <button
            type="button"
            onClick={() => setMode("create")}
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
          >
            <Plus className="h-4 w-4" />
            Добавить новый
          </button>
        </div>
      ) : null}

      <div className="space-y-2" data-testid="custom-ingredient-browser-list">
        {items.map((item) => {
          const { primaryName, secondaryName } = resolveIngredientDisplayNames(item);
          const brand = resolveIngredientBrandLabel(item);
          const country = resolveIngredientCountry(item);
          const summary = buildIngredientTypedSummary(item);
          const ownershipBadgeLabel = item.derivedFromIngredientId ? "ИЗМЕНЕННЫЙ" : "СВОЙ";

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedItem(item)}
              className="block w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="truncate text-sm font-medium text-zinc-950">{primaryName}</div>
                  {secondaryName ? <div className="text-xs text-zinc-500">{secondaryName}</div> : null}
                </div>
                <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 ring-1 ring-amber-200">
                  {ownershipBadgeLabel}
                </span>
              </div>

              {(brand || country || summary) ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
                  {brand ? <span>{brand}</span> : null}
                  {brand && country ? <span aria-hidden="true">•</span> : null}
                  {country ? <span>{country.label}</span> : null}
                  {(brand || country) && summary ? <span aria-hidden="true">•</span> : null}
                  {summary ? <span>{summary}</span> : null}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
