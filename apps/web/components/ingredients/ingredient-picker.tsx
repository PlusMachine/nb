"use client";

import React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import type {
  IngredientCategory,
  IngredientSuggestionItem,
  IngredientSubtype,
  IngredientType
} from "@/features/ingredients/contracts";
import { normalizeSearchText } from "@/features/ingredients/normalization";
import {
  ingredientCategoryLabels,
  resolveIngredientDisplayNames
} from "@/features/ingredients/presentation";

type Props = {
  value?: string;
  type?: IngredientType;
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  limit?: number;
  autoFocus?: boolean;
  onSelect: (item: IngredientSuggestionItem) => void;
  onValueChange?: (value: string) => void;
  onSelectionInvalidated?: () => void;
  onCreateIngredient?: (query: string) => void | Promise<void>;
  placeholder?: string;
  emptyCta?: React.ReactNode;
  allowCatalogProposal?: boolean;
  includeCustom?: boolean;
  proposeIngredient?: (params: {
    q: string;
    type?: IngredientType;
    category?: IngredientCategory;
  }) => Promise<string>;
  searchIngredients?: (params: {
    q: string;
    type?: IngredientType;
    category?: IngredientCategory;
    subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
    includeCustom?: boolean;
    limit: number;
    signal: AbortSignal;
  }) => Promise<IngredientSuggestionItem[]>;
};

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

export const shouldSearchIngredients = ({ isOpen, query }: { isOpen: boolean; query: string }) => (
  isOpen && normalizeSearchText(query).length >= 2
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
  && normalizeSearchText(query).length >= 2
  && !isLoading
  && hasResolvedQuery
  && itemsCount === 0
);

export const buildIngredientSearchParams = ({
  q,
  type,
  category,
  subtype,
  includeCustom = true,
  limit
}: {
  q: string;
  type?: IngredientType;
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  includeCustom?: boolean;
  limit: number;
}) => {
  const params = new URLSearchParams({ q: q.trim(), limit: String(limit) });
  if (type) {
    params.set("type", type);
  }
  if (category) {
    params.set("category", category);
  }
  if (subtype) {
    params.set("subtype", subtype);
  }
  if (!includeCustom) {
    params.set("includeCustom", "false");
  }

  return params;
};

export const buildIngredientCacheKey = ({
  q,
  type,
  category,
  subtype,
  includeCustom,
  limit
}: {
  q: string;
  type?: IngredientType;
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  includeCustom?: boolean;
  limit: number;
}) => `${normalizeSearchText(q)}::${type ?? ""}::${category ?? ""}::${subtype ?? ""}::${includeCustom === false ? "catalog" : "all"}::${limit}`;

const shouldPromoteBrandToPrimaryRow = (item: IngredientSuggestionItem) => (
  item.type === "hop" || item.subtype === "malt"
);

const isBrandAlreadyRepresentedInPrimaryName = (primaryName: string, brand?: string | null) => {
  const normalizedPrimaryName = normalizeSearchText(primaryName);
  const normalizedBrand = normalizeSearchText(brand ?? "");

  if (!normalizedPrimaryName || !normalizedBrand) {
    return false;
  }

  return normalizedPrimaryName.includes(normalizedBrand) || normalizedBrand.includes(normalizedPrimaryName);
};

const stripBrandFromSubtitle = (subtitle: string | undefined, brand: string | null) => {
  if (!subtitle || !brand) {
    return subtitle ?? null;
  }

  const normalizedBrand = normalizeSearchText(brand);
  const parts = subtitle
    .split("•")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => normalizeSearchText(part) !== normalizedBrand);

  return parts.join(" • ") || null;
};

const buildDedupedSubtitle = (parts: Array<string | null | undefined>) => {
  const seen = new Set<string>();

  return parts
    .flatMap((part) => (part ?? "")
      .split("•")
      .map((item) => item.trim())
      .filter(Boolean))
    .filter((part) => {
      const normalized = normalizeSearchText(part);
      if (!normalized || seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    })
    .join(" • ") || null;
};

export const resolveIngredientPickerRowContent = (item: IngredientSuggestionItem) => {
  const { primaryName, secondaryName } = resolveIngredientDisplayNames(item);
  const brandLabel = item.brand?.trim()
    || item.producer?.trim()
    || item.brandName?.trim()
    || item.manufacturer?.trim()
    || null;
  const inlineBrand = shouldPromoteBrandToPrimaryRow(item) && !isBrandAlreadyRepresentedInPrimaryName(primaryName, brandLabel)
    ? brandLabel
    : null;
  const normalizedSubtitle = stripBrandFromSubtitle(item.subtitle, inlineBrand ? brandLabel : null);

  const subtitle = buildDedupedSubtitle([
    inlineBrand ? null : brandLabel,
    item.countryName ?? null,
    normalizedSubtitle
  ]);

  return {
    primaryName,
    secondaryName,
    inlineBrand,
    subtitle
  };
};

const defaultSearchIngredients = async ({
  q,
  type,
  category,
  subtype,
  includeCustom,
  limit,
  signal
}: {
  q: string;
  type?: IngredientType;
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  includeCustom?: boolean;
  limit: number;
  signal: AbortSignal;
}) => {
  const params = buildIngredientSearchParams({ q, type, category, subtype, includeCustom, limit });
  const response = await fetch(`/api/ingredients/search?${params.toString()}`, { signal });
  if (!response.ok) {
    return [];
  }
  const data = await response.json() as { items: IngredientSuggestionItem[] };
  return data.items;
};

const defaultProposeIngredient = async ({
  q,
  type,
  category
}: {
  q: string;
  type?: IngredientType;
  category?: IngredientCategory;
}) => {
  const response = await fetch("/api/ingredients/proposals", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sourceType: "ingredient_picker_gap",
      sourceDisplayName: q.trim(),
      sourcePayload: {
        type: type ?? null,
        category: category ?? null
      }
    })
  });

  const data = await response.json() as { message?: string; error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Не удалось отправить предложение.");
  }

  return data.message ?? "Предложение отправлено в очередь модерации.";
};

export const IngredientPicker = ({
  value,
  type,
  category,
  subtype,
  limit = 10,
  autoFocus = false,
  onSelect,
  onValueChange,
  onSelectionInvalidated,
  onCreateIngredient,
  placeholder = "Search ingredient",
  emptyCta,
  allowCatalogProposal = true,
  includeCustom = true,
  proposeIngredient = defaultProposeIngredient,
  searchIngredients = defaultSearchIngredients
}: Props) => {
  const [query, setQuery] = useState(value ?? "");
  const [items, setItems] = useState<IngredientSuggestionItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasResolvedQuery, setHasResolvedQuery] = useState(false);
  const [emptyStateMessage, setEmptyStateMessage] = useState<string | null>(null);
  const cacheRef = useRef(new Map<string, IngredientSuggestionItem[]>());
  const committedLabelRef = useRef(value ?? "");
  const listboxId = useId();

  useEffect(() => {
    setQuery(value ?? "");
    committedLabelRef.current = value ?? "";
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

    const cacheKey = buildIngredientCacheKey({ q: query, type, category, subtype, includeCustom, limit });
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setItems(cached);
      setActiveIndex(0);
      setIsLoading(false);
      setHasResolvedQuery(true);
      return;
    }

    const controller = new AbortController();
    const run = async () => {
      try {
        setIsLoading(true);
        setHasResolvedQuery(false);
        const nextItems = await searchIngredients({ q: query, type, category, subtype, includeCustom, limit, signal: controller.signal });
        if (controller.signal.aborted) {
          return;
        }

        cacheRef.current.set(cacheKey, nextItems);
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
  }, [category, includeCustom, isOpen, limit, query, searchIngredients, subtype, type]);

  const grouped = useMemo(() => items.reduce<Record<string, IngredientSuggestionItem[]>>((acc, item) => {
    const groupKey = item.category ?? item.type;
    acc[groupKey] ??= [];
    acc[groupKey].push(item);
    return acc;
  }, {}), [items]);

  const showGroupHeaders = !category && Object.keys(grouped).length > 1;

  const commitSelection = (item: IngredientSuggestionItem) => {
    committedLabelRef.current = item.displayName;
    setQuery(item.displayName);
    setIsOpen(false);
    setItems([]);
    setActiveIndex(0);
    setIsLoading(false);
    setHasResolvedQuery(false);
    setEmptyStateMessage(null);
    onSelect(item);
  };

  const handleQueryChange = (nextValue: string) => {
    setQuery(nextValue);
    setIsOpen(Boolean(nextValue.trim()));
    setHasResolvedQuery(false);
    setEmptyStateMessage(null);
    if (
      committedLabelRef.current
      && normalizeSearchText(nextValue) !== normalizeSearchText(committedLabelRef.current)
    ) {
      committedLabelRef.current = "";
      onSelectionInvalidated?.();
    }
    onValueChange?.(nextValue);
  };

  const showSuggestions = shouldShowIngredientSuggestions({ isOpen, itemsCount: items.length });
  const showEmptyState = shouldShowIngredientEmptyState({
    hasResolvedQuery,
    isLoading,
    isOpen,
    itemsCount: items.length,
    query
  });

  const builtInEmptyState = (
    <div className="space-y-2 rounded-md border border-dashed border-zinc-200 bg-zinc-50 px-3 py-3 text-xs text-zinc-600">
      <p>Ничего не найдено для «{query.trim()}».</p>
      <div className="flex flex-wrap gap-2">
        {onCreateIngredient ? (
          <button
            type="button"
            onClick={() => void onCreateIngredient(query.trim())}
            className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white"
          >
            Создать свой ингредиент
          </button>
        ) : null}
        {allowCatalogProposal ? (
          <button
            type="button"
            onClick={async () => {
              try {
                const message = await proposeIngredient({ q: query, type, category });
                setEmptyStateMessage(message);
              } catch (error) {
                setEmptyStateMessage((error as Error).message);
              }
            }}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs"
          >
            Предложить ингредиент в каталог
          </button>
        ) : null}
      </div>
      {emptyStateMessage ? <p className="text-xs text-zinc-500">{emptyStateMessage}</p> : null}
    </div>
  );

  return (
    <div className="space-y-2">
      <input
        value={query}
        onChange={(event) => {
          handleQueryChange(event.target.value);
        }}
        autoFocus={autoFocus}
        onFocus={() => setIsOpen(Boolean(normalizeSearchText(query)))}
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
            setActiveIndex((index) => Math.min(index + 1, items.length - 1));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
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
      {isLoading && isOpen && normalizeSearchText(query) ? (
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
                const index = items.findIndex((candidate) => candidate.id === item.id);
                const { primaryName, secondaryName, inlineBrand, subtitle } = resolveIngredientPickerRowContent(item);

                return (
                  <button
                    key={item.id}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 ${index === activeIndex ? "bg-zinc-100" : ""}`}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => commitSelection(item)}
                    type="button"
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-zinc-950">{primaryName}</span>
                        {item.source === "custom" ? (
                          <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 ring-1 ring-amber-200">
                            СВОЙ
                          </span>
                        ) : null}
                        {inlineBrand ? (
                          <span className="inline-flex min-w-0 items-baseline gap-2 text-sm font-semibold text-zinc-700">
                            <span aria-hidden="true" className="text-zinc-400">•</span>
                            <span className="truncate">{inlineBrand}</span>
                          </span>
                        ) : null}
                      </div>
                      {secondaryName ? <div className="text-xs text-zinc-500">{secondaryName}</div> : null}
                      {subtitle ? <div className="text-xs text-zinc-500">{subtitle}</div> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {showEmptyState ? (emptyCta ?? builtInEmptyState) : null}
    </div>
  );
};
