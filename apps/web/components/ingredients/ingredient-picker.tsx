"use client";

import React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { CountryFlagLabel } from "@/components/shared/country-flag";
import type {
  IngredientCategory,
  IngredientManufacturerRefinement,
  IngredientSearchResult,
  IngredientSuggestionItem,
  IngredientSubtype,
  IngredientType
} from "@/features/ingredients/contracts";
import {
  ingredientSearchExpandedLimit,
  ingredientSearchSimpleModeThreshold
} from "@/features/ingredients/contracts";
import {
  normalizeSearchText,
  rewriteIngredientQueryForManufacturer
} from "@/features/ingredients/normalization";
import {
  ingredientCategoryLabels,
  buildIngredientTypedSummary,
  resolveIngredientBrandLabel,
  resolveIngredientCountry,
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
    manufacturer?: string;
    includeCustom?: boolean;
    limit: number;
    signal: AbortSignal;
  }) => Promise<IngredientSearchResult | IngredientSuggestionItem[]>;
};

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === "AbortError";
const ingredientPickerCollapsedResultsCount = 6;

type IngredientPickerSearchResponse = IngredientSearchResult | IngredientSuggestionItem[];

export const shouldSearchIngredients = ({ isOpen, query }: { isOpen: boolean; query: string }) => (
  isOpen && normalizeSearchText(query).length >= 2
);

export const shouldShowIngredientSuggestions = ({
  isOpen,
  itemsCount,
  refinementsCount = 0
}: {
  isOpen: boolean;
  itemsCount: number;
  refinementsCount?: number;
}) => (
  isOpen && (itemsCount > 0 || refinementsCount > 0)
);

export const shouldShowIngredientEmptyState = ({
  hasResolvedQuery,
  isLoading,
  isOpen,
  itemsCount,
  refinementsCount = 0,
  query
}: {
  hasResolvedQuery: boolean;
  isLoading: boolean;
  isOpen: boolean;
  itemsCount: number;
  refinementsCount?: number;
  query: string;
}) => (
  isOpen
  && normalizeSearchText(query).length >= 2
  && !isLoading
  && hasResolvedQuery
  && itemsCount === 0
  && refinementsCount === 0
);

export const shouldUseIngredientRefinementMode = ({
  total,
  refinementsCount,
  activeManufacturer
}: {
  total: number;
  refinementsCount: number;
  activeManufacturer?: IngredientManufacturerRefinement | null;
}) => (
  total > ingredientSearchSimpleModeThreshold
  && refinementsCount > 0
  && !activeManufacturer
);

export const shouldRemoveIngredientManufacturerOnBackspace = ({
  key,
  query,
  activeManufacturer
}: {
  key: string;
  query: string;
  activeManufacturer?: IngredientManufacturerRefinement | null;
}) => (
  key === "Backspace"
  && normalizeSearchText(query).length === 0
  && Boolean(activeManufacturer)
);

export const resolveIngredientPickerSearchQuery = ({
  query,
  activeManufacturer
}: {
  query: string;
  activeManufacturer?: IngredientManufacturerRefinement | null;
}) => {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length > 0) {
    return query;
  }

  return activeManufacturer?.label ?? query;
};

export const normalizeIngredientSearchResponse = (
  response: IngredientPickerSearchResponse,
  fallbackManufacturer?: IngredientManufacturerRefinement | null
): IngredientSearchResult => {
  if (Array.isArray(response)) {
    return {
      items: response,
      refinements: [],
      total: response.length,
      isBroadMatch: response.length > ingredientSearchSimpleModeThreshold,
      hasMore: false,
      appliedManufacturer: fallbackManufacturer ?? null
    };
  }

  return {
    items: response.items,
    refinements: response.refinements,
    total: response.total,
    isBroadMatch: response.isBroadMatch,
    hasMore: response.hasMore,
    appliedManufacturer: response.appliedManufacturer ?? fallbackManufacturer ?? null
  };
};

export const resolveVisibleIngredientItems = ({
  items,
  isBroadMatch,
  isExpanded
}: {
  items: IngredientSuggestionItem[];
  isBroadMatch: boolean;
  isExpanded: boolean;
}) => (
  isBroadMatch && !isExpanded
    ? items.slice(0, ingredientPickerCollapsedResultsCount)
    : items
);

export const countIngredientPickerRefinementCoverage = (
  refinements: IngredientManufacturerRefinement[]
) => refinements.reduce((sum, refinement) => sum + refinement.count, 0);

export const resolveIngredientPickerRequestedLimit = ({
  defaultLimit,
  isExpanded,
  total
}: {
  defaultLimit: number;
  isExpanded: boolean;
  total: number;
}) => (
  isExpanded
    ? Math.max(defaultLimit, Math.min(total || ingredientSearchExpandedLimit, ingredientSearchExpandedLimit))
    : defaultLimit
);

export const buildIngredientPickerExpandLabel = ({
  total
}: {
  total: number;
}) => (
  total <= ingredientSearchExpandedLimit
    ? `Показать все результаты (${total})`
    : `Показать первые ${ingredientSearchExpandedLimit} из ${total}`
);

export const buildIngredientSearchParams = ({
  q,
  type,
  category,
  subtype,
  manufacturer,
  includeCustom = true,
  limit
}: {
  q: string;
  type?: IngredientType;
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  manufacturer?: string;
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
  if (manufacturer) {
    params.set("manufacturer", manufacturer);
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
  manufacturer,
  includeCustom,
  limit
}: {
  q: string;
  type?: IngredientType;
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  manufacturer?: string;
  includeCustom?: boolean;
  limit: number;
}) => `${normalizeSearchText(q)}::${type ?? ""}::${category ?? ""}::${subtype ?? ""}::${normalizeSearchText(manufacturer ?? "")}::${includeCustom === false ? "catalog" : "all"}::${limit}`;

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

const stripCountryFromSubtitle = (subtitle: string | null | undefined, countryLabel: string | null) => {
  if (!subtitle || !countryLabel) {
    return subtitle ?? null;
  }

  const normalizedCountry = normalizeSearchText(countryLabel);
  const parts = subtitle
    .split("•")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => normalizeSearchText(part) !== normalizedCountry);

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
  const brandLabel = resolveIngredientBrandLabel(item);
  const inlineBrand = shouldPromoteBrandToPrimaryRow(item) && !isBrandAlreadyRepresentedInPrimaryName(primaryName, brandLabel)
    ? brandLabel
    : null;
  const country = resolveIngredientCountry(item);
  const normalizedSubtitle = stripCountryFromSubtitle(
    stripBrandFromSubtitle(item.subtitle, inlineBrand ? brandLabel : null),
    country?.label ?? null
  );

  const subtitle = buildDedupedSubtitle([
    inlineBrand ? null : brandLabel,
    normalizedSubtitle
  ]);

  return {
    primaryName,
    secondaryName,
    inlineBrand,
    country,
    subtitle
  };
};

type IngredientSelectionCardProps = {
  item: IngredientSuggestionItem;
  label?: string;
  className?: string;
  onClear?: () => void;
};

export const IngredientSelectionCard = ({
  item,
  label = "Выбран ингредиент",
  className = "",
  onClear
}: IngredientSelectionCardProps) => {
  const { primaryName, secondaryName, inlineBrand, country, subtitle } = resolveIngredientPickerRowContent(item);
  const typedSummary = buildIngredientTypedSummary(item);
  const brandLabel = resolveIngredientBrandLabel(item);

  return (
    <div className={`rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 ${className}`.trim()}>
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          {label}
        </div>
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Очистить выбранный ингредиент"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm text-zinc-400 transition-colors hover:bg-white hover:text-zinc-700"
          >
            ×
          </button>
        ) : null}
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-zinc-950 sm:text-base">{primaryName}</span>
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
        {secondaryName ? <div className="mt-0.5 text-xs text-zinc-500">{secondaryName}</div> : null}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
          {country ? (
            <span className="inline-flex items-center rounded-full bg-white px-2 py-1 ring-1 ring-zinc-200">
              <CountryFlagLabel
                countryCode={country.code}
                label={country.label}
                iconClassName="h-3 w-4"
                className="gap-1"
              />
            </span>
          ) : null}
          {inlineBrand || !brandLabel ? null : (
            <span className="rounded-full bg-white px-2 py-1 ring-1 ring-zinc-200">{brandLabel}</span>
          )}
          {typedSummary ? (
            <span className="rounded-full bg-white px-2 py-1 font-medium text-zinc-700 ring-1 ring-zinc-200">
              {typedSummary}
            </span>
          ) : null}
          {subtitle && subtitle !== typedSummary ? (
            <span className="text-zinc-500">{subtitle}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
};

type IngredientPickerManufacturerChipProps = {
  refinement: IngredientManufacturerRefinement;
  onRemove: () => void;
};

export const IngredientPickerManufacturerChip = ({
  refinement,
  onRemove
}: IngredientPickerManufacturerChipProps) => (
  <div className="flex flex-wrap items-center gap-2" data-testid="ingredient-picker-manufacturer-chip">
    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
      Производитель
    </span>
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-3 py-1.5 text-xs font-medium text-white"
      aria-label={`Убрать фильтр производителя ${refinement.label}`}
    >
      <span>{refinement.label}</span>
      <span aria-hidden="true" className="text-zinc-300">×</span>
    </button>
  </div>
);

const emptyIngredientSearchResult: IngredientSearchResult = {
  items: [],
  refinements: [],
  total: 0,
  isBroadMatch: false,
  hasMore: false,
  appliedManufacturer: null
};

const defaultSearchIngredients = async ({
  q,
  type,
  category,
  subtype,
  manufacturer,
  includeCustom,
  limit,
  signal
}: {
  q: string;
  type?: IngredientType;
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  manufacturer?: string;
  includeCustom?: boolean;
  limit: number;
  signal: AbortSignal;
}) => {
  const params = buildIngredientSearchParams({ q, type, category, subtype, manufacturer, includeCustom, limit });
  const response = await fetch(`/api/ingredients/search?${params.toString()}`, { signal });
  if (!response.ok) {
    return {
      ...emptyIngredientSearchResult,
      appliedManufacturer: manufacturer ? {
        type: "manufacturer" as const,
        label: manufacturer,
        normalizedLabel: normalizeSearchText(manufacturer),
        count: 0,
        score: 0
      } : null
    };
  }
  return await response.json() as IngredientSearchResult;
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
  const [searchResult, setSearchResult] = useState<IngredientSearchResult>(emptyIngredientSearchResult);
  const [activeManufacturer, setActiveManufacturer] = useState<IngredientManufacturerRefinement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasResolvedQuery, setHasResolvedQuery] = useState(false);
  const [emptyStateMessage, setEmptyStateMessage] = useState<string | null>(null);
  const cacheRef = useRef(new Map<string, IngredientSearchResult>());
  const committedLabelRef = useRef(value ?? "");
  const listboxId = useId();
  const activeManufacturerLabel = activeManufacturer?.label ?? undefined;
  const activeManufacturerKey = activeManufacturer?.normalizedLabel ?? "";
  const appliedManufacturer = searchResult.appliedManufacturer ?? activeManufacturer;
  const effectiveSearchQuery = resolveIngredientPickerSearchQuery({
    query,
    activeManufacturer: appliedManufacturer
  });
  const refinementMode = shouldUseIngredientRefinementMode({
    total: searchResult.total,
    refinementsCount: searchResult.refinements.length,
    activeManufacturer: appliedManufacturer
  });
  const visibleItems = useMemo(() => resolveVisibleIngredientItems({
    items: searchResult.items,
    isBroadMatch: searchResult.isBroadMatch,
    isExpanded
  }), [isExpanded, searchResult.isBroadMatch, searchResult.items]);
  const refinementCoverage = countIngredientPickerRefinementCoverage(searchResult.refinements);

  useEffect(() => {
    setQuery(value ?? "");
    committedLabelRef.current = value ?? "";
    setIsOpen((current) => current && (Boolean((value ?? "").trim()) || Boolean(activeManufacturerKey)));
  }, [activeManufacturerKey, value]);

  useEffect(() => {
    setActiveManufacturer(null);
    setIsExpanded(false);
    setSearchResult(emptyIngredientSearchResult);
    setActiveIndex(0);
    setHasResolvedQuery(false);
  }, [category, includeCustom, subtype, type]);

  useEffect(() => {
    setIsExpanded(false);
  }, [activeManufacturer?.normalizedLabel, query]);

  useEffect(() => {
    if (!shouldSearchIngredients({ isOpen, query: effectiveSearchQuery })) {
      setSearchResult({
        ...emptyIngredientSearchResult,
        appliedManufacturer: activeManufacturer
      });
      setActiveIndex(0);
      setIsLoading(false);
      setHasResolvedQuery(false);
      return;
    }

    const requestedLimit = resolveIngredientPickerRequestedLimit({
      defaultLimit: limit,
      isExpanded,
      total: searchResult.total
    });
    const cacheKey = buildIngredientCacheKey({
      q: query,
      type,
      category,
      subtype,
      manufacturer: activeManufacturerLabel,
      includeCustom,
      limit: requestedLimit
    });
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setSearchResult(cached);
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
        const response = await searchIngredients({
          q: effectiveSearchQuery,
          type,
          category,
          subtype,
          manufacturer: activeManufacturerLabel,
          includeCustom,
          limit: requestedLimit,
          signal: controller.signal
        });
        if (controller.signal.aborted) {
          return;
        }

        const nextResult = normalizeIngredientSearchResponse(response, activeManufacturer);
        cacheRef.current.set(cacheKey, nextResult);
        setSearchResult(nextResult);
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
  }, [activeManufacturer, activeManufacturerKey, activeManufacturerLabel, category, effectiveSearchQuery, includeCustom, isExpanded, isOpen, limit, query, searchIngredients, subtype, type]);

  const grouped = useMemo(() => visibleItems.reduce<Record<string, IngredientSuggestionItem[]>>((acc, item) => {
    const groupKey = item.category ?? item.type;
    acc[groupKey] ??= [];
    acc[groupKey].push(item);
    return acc;
  }, {}), [visibleItems]);

  const showGroupHeaders = !category && Object.keys(grouped).length > 1;

  const commitSelection = (item: IngredientSuggestionItem) => {
    committedLabelRef.current = item.displayName;
    setQuery(item.displayName);
    setIsOpen(false);
    setSearchResult(emptyIngredientSearchResult);
    setActiveManufacturer(null);
    setActiveIndex(0);
    setIsExpanded(false);
    setIsLoading(false);
    setHasResolvedQuery(false);
    setEmptyStateMessage(null);
    onSelect(item);
  };

  const handleQueryChange = (
    nextValue: string,
    options?: { nextManufacturer?: IngredientManufacturerRefinement | null }
  ) => {
    setQuery(nextValue);
    const manufacturerForOpen = options?.nextManufacturer ?? activeManufacturer;
    setIsOpen(Boolean(nextValue.trim()) || Boolean(manufacturerForOpen));
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

  const clearManufacturerFilter = () => {
    setActiveManufacturer(null);
    setActiveIndex(0);
    setHasResolvedQuery(false);
    setIsExpanded(false);
    setEmptyStateMessage(null);
    setIsOpen(Boolean(normalizeSearchText(query)));
  };

  const showSuggestions = shouldShowIngredientSuggestions({
    isOpen,
    itemsCount: visibleItems.length,
    refinementsCount: refinementMode ? searchResult.refinements.length : 0
  });
  const showEmptyState = shouldShowIngredientEmptyState({
    hasResolvedQuery,
    isLoading,
    isOpen,
    itemsCount: searchResult.items.length,
    refinementsCount: searchResult.refinements.length,
    query: effectiveSearchQuery
  });
  const showExpandControl = !isExpanded && (
    searchResult.hasMore
    || visibleItems.length < searchResult.items.length
  );
  const ingredientSectionTitle = appliedManufacturer
    ? `Результаты: ${appliedManufacturer.label}`
    : refinementMode
      ? "Лучшие совпадения"
      : null;
  const inputPlaceholder = appliedManufacturer && !normalizeSearchText(query)
    ? `Искать внутри ${appliedManufacturer.label}`
    : placeholder;
  const emptyStateQueryLabel = query.trim() || appliedManufacturer?.label || effectiveSearchQuery.trim();
  const expandedResultsSummary = isExpanded && searchResult.total > searchResult.items.length
    ? `Показаны первые ${searchResult.items.length} из ${searchResult.total} совпадений. Уточните запрос или производителя.`
    : null;

  const builtInEmptyState = (
    <div className="space-y-2 rounded-md border border-dashed border-zinc-200 bg-zinc-50 px-3 py-3 text-xs text-zinc-600">
      <p>Ничего не найдено для «{emptyStateQueryLabel}».</p>
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
      {appliedManufacturer ? (
        <IngredientPickerManufacturerChip
          refinement={appliedManufacturer}
          onRemove={clearManufacturerFilter}
        />
      ) : null}
      <input
        value={query}
        onChange={(event) => {
          handleQueryChange(event.target.value);
        }}
        autoFocus={autoFocus}
        onFocus={() => setIsOpen(Boolean(normalizeSearchText(query)) || Boolean(appliedManufacturer))}
        onBlur={() => setIsOpen(false)}
        placeholder={inputPlaceholder}
        className="h-10 w-full rounded-md border border-zinc-200 px-3 text-sm"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={showSuggestions && visibleItems.length > 0 ? listboxId : undefined}
        aria-autocomplete="list"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false);
            return;
          }
          if (shouldRemoveIngredientManufacturerOnBackspace({
            key: event.key,
            query,
            activeManufacturer: appliedManufacturer
          })) {
            event.preventDefault();
            clearManufacturerFilter();
            return;
          }
          if (visibleItems.length === 0) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, visibleItems.length - 1));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          }
          if (event.key === "Enter") {
            event.preventDefault();
            const active = visibleItems[activeIndex];
            if (active) {
              commitSelection(active);
            }
          }
        }}
      />
      {isLoading && isOpen && normalizeSearchText(effectiveSearchQuery) ? (
        <p className="text-xs text-zinc-500">Ищем ингредиенты...</p>
      ) : null}
      {showSuggestions && (
        <div className="overflow-hidden rounded-md border bg-white">
          {refinementMode ? (
            <div className="border-b border-zinc-200 px-3 py-3" data-testid="ingredient-picker-refinements">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Уточнить производителя
                </div>
                <div className="text-xs text-zinc-500">
                  {searchResult.total} совпадений
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {searchResult.refinements.map((refinement) => (
                  <button
                    key={refinement.normalizedLabel}
                    type="button"
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => {
                      const rewrittenQuery = rewriteIngredientQueryForManufacturer({
                        query,
                        manufacturer: refinement.label
                      });
                      setActiveManufacturer(refinement);
                      handleQueryChange(rewrittenQuery, { nextManufacturer: refinement });
                      setActiveIndex(0);
                      setIsExpanded(false);
                      setEmptyStateMessage(null);
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-800 transition-colors hover:border-zinc-300 hover:bg-zinc-100"
                  >
                    <span>{refinement.label}</span>
                    <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-zinc-500 ring-1 ring-zinc-200">
                      {refinement.count}
                    </span>
                  </button>
                ))}
              </div>
              {searchResult.refinements.length > 0 && refinementCoverage < searchResult.total ? (
                <p className="mt-2 text-xs text-zinc-500">
                  Показаны топ-{searchResult.refinements.length} производителей для {refinementCoverage} из {searchResult.total} совпадений.
                </p>
              ) : null}
            </div>
          ) : null}

          {visibleItems.length > 0 ? (
            <div id={listboxId} role="listbox">
              {ingredientSectionTitle ? (
                <div className="flex items-center justify-between gap-3 bg-zinc-50 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                  <span>{ingredientSectionTitle}</span>
                  <span className="normal-case tracking-normal text-zinc-400">
                    {searchResult.total}
                  </span>
                </div>
              ) : null}

              {Object.entries(grouped).map(([group, groupItems]) => (
                <div key={group} className="border-b last:border-b-0">
                  {showGroupHeaders ? (
                    <div className="bg-zinc-50 px-3 py-1 text-xs uppercase text-zinc-500">
                      {ingredientCategoryLabels[group as IngredientCategory] ?? group}
                    </div>
                  ) : null}
                  {groupItems.map((item) => {
                    const index = visibleItems.findIndex((candidate) => (
                      candidate.id === item.id
                      && candidate.source === item.source
                    ));
                    const { primaryName, secondaryName, inlineBrand, country, subtitle } = resolveIngredientPickerRowContent(item);

                    return (
                      <button
                        key={`${item.source}:${item.id}`}
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
                          {country || subtitle ? (
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-zinc-500">
                              {country ? (
                                <CountryFlagLabel
                                  countryCode={country.code}
                                  label={country.label}
                                  iconClassName="h-3 w-4"
                                  className="gap-1"
                                />
                              ) : null}
                              {country && subtitle ? <span aria-hidden="true">•</span> : null}
                              {subtitle ? <span>{subtitle}</span> : null}
                            </div>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : null}

          {showExpandControl ? (
            <div className="border-t border-zinc-200 px-3 py-2">
              <button
                type="button"
                data-testid="ingredient-picker-show-all"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => setIsExpanded(true)}
                className="text-sm font-medium text-zinc-700 underline underline-offset-2"
              >
                {buildIngredientPickerExpandLabel({ total: searchResult.total })}
              </button>
            </div>
          ) : null}
          {expandedResultsSummary ? (
            <div className="border-t border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
              {expandedResultsSummary}
            </div>
          ) : null}
        </div>
      )}
      {showEmptyState ? (emptyCta ?? builtInEmptyState) : null}
    </div>
  );
};
