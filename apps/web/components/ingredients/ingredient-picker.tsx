"use client";

import React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { IngredientFavoriteToggle } from "@/components/ingredients/ingredient-favorite-toggle";
import { CountryFlag, CountryFlagLabel } from "@/components/shared/country-flag";
import type {
  IngredientCategory,
  IngredientConsumableGroupRefinement,
  IngredientSearchFamilyScope,
  IngredientManufacturerRefinement,
  IngredientPickerQuickStartResult,
  IngredientSearchResult,
  IngredientSearchRefinement,
  IngredientSuggestionItem,
  IngredientSubtype,
  IngredientType,
  UserIngredientReference
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
  type ResolvedIngredientCountry,
  resolveIngredientBrandLabel,
  resolveIngredientCountry,
  resolveIngredientDisplayNames,
  resolveIngredientFermentableKindLabel
} from "@/features/ingredients/presentation";
import {
  buildIngredientPickerQuickStartFamilySearchValue,
  filterIngredientPickerRecentReferencesForContext,
  ingredientPickerMaltQuickStartFallbackBrands,
  ingredientPickerMaltQuickStartFamilies,
  ingredientPickerQuickStartBrandLimit,
  ingredientPickerQuickStartRecentStorageKey,
  type IngredientPickerStoredRecentSelection,
  resolveIngredientPickerQuickStartFamilyScope,
  resolveIngredientPickerScopedPlaceholder,
  sanitizeIngredientPickerStoredRecentSelections,
  shouldShowIngredientQuickStart,
  upsertIngredientPickerRecentSelections
} from "@/features/ingredients/picker-quick-start";
import {
  buildConsumableMarketPrimaryLabel,
  formatConsumablePackageLabel,
  resolveConsumableMarketNames,
  resolveConsumablePackageVariantName,
  resolveConsumableTechnicalData
} from "@/features/ingredients/consumables";

export {
  buildIngredientPickerQuickStartFamilySearchValue,
  ingredientPickerMaltQuickStartFamilies,
  resolveIngredientPickerScopedPlaceholder,
  shouldShowIngredientQuickStart
};

type Props = {
  value?: string;
  type?: IngredientType;
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  limit?: number;
  autoFocus?: boolean;
  focusSignal?: number;
  onSelect: (item: IngredientSuggestionItem) => void;
  onValueChange?: (value: string) => void;
  onSelectionInvalidated?: () => void;
  onCreateIngredient?: (query: string) => void | Promise<void>;
  placeholder?: string;
  emptyCta?: React.ReactNode | ((context: {
    hasActiveFilters: boolean;
    resetFilters: () => void;
  }) => React.ReactNode);
  allowCatalogProposal?: boolean;
  includeCustom?: boolean;
  allowCustomOnlyFilter?: boolean;
  enableQuickStart?: boolean;
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
    family?: string;
    group?: string;
    manufacturer?: string;
    favoritesOnly?: boolean;
    customOnly?: boolean;
    includeCustom?: boolean;
    limit: number;
    signal: AbortSignal;
  }) => Promise<IngredientSearchResult | IngredientSuggestionItem[]>;
  loadQuickStartIngredients?: (params: {
    category: IngredientCategory;
    subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
    recentReferences: UserIngredientReference[];
    signal: AbortSignal;
  }) => Promise<IngredientPickerQuickStartResult>;
};

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === "AbortError";
const ingredientPickerCollapsedResultsCount = 6;
export const ingredientPickerExpandedRecentCount = 10;

type IngredientPickerSearchResponse = IngredientSearchResult | IngredientSuggestionItem[];

export const shouldSearchIngredients = ({
  isOpen,
  query,
  hasSearchScope = false
}: {
  isOpen: boolean;
  query: string;
  hasSearchScope?: boolean;
}) => (
  isOpen && (normalizeSearchText(query).length >= 2 || hasSearchScope)
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
  query,
  hasSearchScope = false
}: {
  hasResolvedQuery: boolean;
  isLoading: boolean;
  isOpen: boolean;
  itemsCount: number;
  refinementsCount?: number;
  query: string;
  hasSearchScope?: boolean;
}) => (
  isOpen
  && (normalizeSearchText(query).length >= 2 || hasSearchScope)
  && !isLoading
  && hasResolvedQuery
  && itemsCount === 0
  && refinementsCount === 0
);

export const shouldShowIngredientLoadingState = ({
  hasResolvedQuery,
  isOpen,
  query,
  hasSearchScope = false
}: {
  hasResolvedQuery: boolean;
  isOpen: boolean;
  query: string;
  hasSearchScope?: boolean;
}) => (
  shouldSearchIngredients({
    isOpen,
    query,
    hasSearchScope
  }) && !hasResolvedQuery
);

export const resolveIngredientPickerLoadingLabel = ({
  query,
  hasSearchScope = false
}: {
  query: string;
  hasSearchScope?: boolean;
}) => (
  normalizeSearchText(query).length > 0
    ? "Ищем совпадения..."
    : hasSearchScope
      ? "Подбираем варианты по выбранным фильтрам..."
      : "Ищем ингредиенты..."
);

export const IngredientPickerLoadingState = ({
  label
}: {
  label: string;
}) => (
  <div
    className="flex min-h-[12rem] items-center justify-center rounded-md border border-zinc-200 bg-white px-3 py-2.5 text-xs text-zinc-600 shadow-sm"
    data-testid="ingredient-picker-loading"
    role="status"
    aria-live="polite"
  >
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700"
      />
      <span className="font-medium text-zinc-700">{label}</span>
    </div>
  </div>
);

export const countIngredientPickerActiveScopes = ({
  activeFamily,
  activeGroup,
  activeManufacturer,
  activeFavoritesOnly = false,
  activeCustomOnly = false
}: {
  activeFamily?: IngredientSearchFamilyScope | null;
  activeGroup?: IngredientConsumableGroupRefinement | null;
  activeManufacturer?: IngredientManufacturerRefinement | null;
  activeFavoritesOnly?: boolean;
  activeCustomOnly?: boolean;
}) => (
  Number(Boolean(activeFamily))
  + Number(Boolean(activeGroup))
  + Number(Boolean(activeManufacturer))
  + Number(activeFavoritesOnly)
  + Number(activeCustomOnly)
);

export const resolveIngredientPickerScopedState = ({
  activeScopeCount,
  nextQuery,
  nextFamily,
  nextGroup,
  nextManufacturer,
  nextFavoritesOnly,
  nextCustomOnly
}: {
  activeScopeCount: number;
  nextQuery: string;
  nextFamily?: IngredientSearchFamilyScope | null;
  nextGroup?: IngredientConsumableGroupRefinement | null;
  nextManufacturer?: IngredientManufacturerRefinement | null;
  nextFavoritesOnly: boolean;
  nextCustomOnly?: boolean;
}) => {
  const nextScopeCount = countIngredientPickerActiveScopes({
    activeFamily: nextFamily ?? null,
    activeGroup: nextGroup ?? null,
    activeManufacturer: nextManufacturer ?? null,
    activeFavoritesOnly: nextFavoritesOnly,
    activeCustomOnly: nextCustomOnly ?? false
  });
  const nextNormalizedQuery = normalizeSearchText(nextQuery);

  return {
    nextScopeCount,
    nextNormalizedQuery,
    isOpen: (
      Boolean(nextNormalizedQuery)
      || Boolean(nextFamily)
      || Boolean(nextGroup)
      || Boolean(nextManufacturer)
      || nextFavoritesOnly
      || Boolean(nextCustomOnly)
    ),
    suppressQuickStart: (
      activeScopeCount > 0
      && nextScopeCount === 0
      && nextNormalizedQuery.length > 0
    )
  };
};

export const shouldShowIngredientScopeReset = ({
  activeScopeCount
}: {
  activeScopeCount: number;
}) => activeScopeCount >= 2;

export const shouldUseIngredientRefinementMode = ({
  total,
  refinements,
  activeManufacturer,
  activeGroup
}: {
  total: number;
  refinements: IngredientSearchRefinement[];
  activeManufacturer?: IngredientManufacturerRefinement | null;
  activeGroup?: IngredientConsumableGroupRefinement | null;
}) => (
  total > ingredientSearchSimpleModeThreshold
  && refinements.length > 0
  && (
    (refinements[0]?.type === "manufacturer" && !activeManufacturer)
    || (refinements[0]?.type === "consumable_group" && !activeGroup)
  )
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

export const shouldCloseIngredientPickerAfterBlur = ({
  documentHasFocus,
  nextFocusedInsidePicker
}: {
  documentHasFocus: boolean;
  nextFocusedInsidePicker: boolean;
}) => documentHasFocus && !nextFocusedInsidePicker;

export const resolveIngredientPickerSearchQuery = ({
  query,
  activeManufacturer,
  activeGroup,
  activeFamily
}: {
  query: string;
  activeManufacturer?: IngredientManufacturerRefinement | null;
  activeGroup?: IngredientConsumableGroupRefinement | null;
  activeFamily?: IngredientSearchFamilyScope | null;
}) => {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length > 0) {
    return query;
  }

  return activeFamily?.presetQuery ?? query;
};

export const normalizeIngredientSearchResponse = (
  response: IngredientPickerSearchResponse,
  fallbackManufacturer?: IngredientManufacturerRefinement | null,
  fallbackGroup?: IngredientConsumableGroupRefinement | null,
  fallbackFamily?: IngredientSearchFamilyScope | null,
  fallbackFavoritesOnly = false,
  fallbackCustomOnly = false
): IngredientSearchResult => {
  if (Array.isArray(response)) {
    return {
      items: response,
      refinements: [],
      total: response.length,
      isBroadMatch: response.length > ingredientSearchSimpleModeThreshold,
      hasMore: false,
      appliedManufacturer: fallbackManufacturer ?? null,
      appliedGroup: fallbackGroup ?? null,
      appliedFamily: fallbackFamily ?? null,
      appliedFavoritesOnly: fallbackFavoritesOnly,
      appliedCustomOnly: fallbackCustomOnly
    };
  }

  return {
    items: response.items,
    refinements: response.refinements,
    total: response.total,
    isBroadMatch: response.isBroadMatch,
    hasMore: response.hasMore,
    appliedManufacturer: response.appliedManufacturer ?? fallbackManufacturer ?? null,
    appliedGroup: response.appliedGroup ?? fallbackGroup ?? null,
    appliedFamily: response.appliedFamily ?? fallbackFamily ?? null,
    appliedFavoritesOnly: response.appliedFavoritesOnly ?? fallbackFavoritesOnly,
    appliedCustomOnly: response.appliedCustomOnly ?? fallbackCustomOnly
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
  refinements: IngredientSearchRefinement[]
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
  family,
  group,
  manufacturer,
  favoritesOnly = false,
  customOnly = false,
  includeCustom = true,
  limit
}: {
  q: string;
  type?: IngredientType;
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  family?: string;
  group?: string;
  manufacturer?: string;
  favoritesOnly?: boolean;
  customOnly?: boolean;
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
  if (family) {
    params.set("family", family);
  }
  if (group) {
    params.set("group", group);
  }
  if (manufacturer) {
    params.set("manufacturer", manufacturer);
  }
  if (favoritesOnly) {
    params.set("favoritesOnly", "true");
  }
  if (customOnly) {
    params.set("customOnly", "true");
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
  family,
  group,
  manufacturer,
  favoritesOnly,
  customOnly,
  includeCustom,
  limit
}: {
  q: string;
  type?: IngredientType;
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  family?: string;
  group?: string;
  manufacturer?: string;
  favoritesOnly?: boolean;
  customOnly?: boolean;
  includeCustom?: boolean;
  limit: number;
}) => `${normalizeSearchText(q)}::${type ?? ""}::${category ?? ""}::${subtype ?? ""}::${normalizeSearchText(family ?? "")}::${normalizeSearchText(group ?? "")}::${normalizeSearchText(manufacturer ?? "")}::${favoritesOnly ? "favorites" : "all-items"}::${customOnly ? "custom-only" : "all-sources"}::${includeCustom === false ? "catalog" : "all"}::${limit}`;

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

const resolveIngredientPickerMetaSummary = ({
  subtitle,
  brandLabel
}: {
  subtitle?: string | null;
  brandLabel?: string | null;
}) => stripBrandFromSubtitle(subtitle ?? undefined, brandLabel ?? null);

const IngredientPickerMetaLine = ({
  brandLabel,
  country,
  summary,
  compact = false
}: {
  brandLabel?: string | null;
  country?: ResolvedIngredientCountry | null;
  summary?: string | null;
  compact?: boolean;
}) => {
  if (!brandLabel && !country?.code && !summary) {
    return null;
  }

  return (
    <div className={compact
      ? "flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] text-zinc-500"
      : "flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-zinc-500"}
    >
      {brandLabel ? (
        <span className="font-medium text-zinc-700">{brandLabel}</span>
      ) : null}
      {country?.code ? (
        <CountryFlag
          countryCode={country.code}
          className={compact ? "h-2.5 w-3 shrink-0 ring-0" : "h-3 w-4 shrink-0"}
        />
      ) : null}
      {summary ? (
        <>
          {(brandLabel || country?.code) ? <span aria-hidden="true">•</span> : null}
          <span className={compact ? "truncate" : undefined}>{summary}</span>
        </>
      ) : null}
    </div>
  );
};

const resolveIngredientOwnershipBadgeLabel = (item: Pick<IngredientSuggestionItem, "source" | "derivedFromIngredientId">) => {
  if (item.source !== "custom") {
    return null;
  }

  return item.derivedFromIngredientId ? "ИЗМЕНЕННЫЙ" : "СВОЙ";
};

const functionalConsumableTerms = [
  "санитайзер",
  "мойка",
  "осветлитель",
  "осветление",
  "подкормка",
  "пеногаситель",
  "антиоксидант",
  "фермент",
  "кислота",
  "щелочь"
];

const shouldPromoteConsumableAlias = (
  item: IngredientSuggestionItem,
  alias: string,
  marketNames: string[]
) => {
  const normalizedAlias = normalizeSearchText(alias);
  if (!normalizedAlias) {
    return false;
  }

  if (marketNames.some((name) => normalizeSearchText(name) === normalizedAlias)) {
    return true;
  }

  if (/[a-z0-9]/i.test(alias)) {
    return true;
  }

  return !functionalConsumableTerms.some((term) => normalizedAlias.includes(term))
    && normalizedAlias !== normalizeSearchText(item.primaryLabelRu ?? item.displayName);
};

const resolveMatchedConsumablePackageVariant = (item: IngredientSuggestionItem) => {
  if (!item.packageVariants?.length) {
    return null;
  }

  if (item.matchedPackageVariantId) {
    const matched = item.packageVariants.find((variant) => variant.id === item.matchedPackageVariantId);
    if (matched) {
      return matched;
    }
  }

  return item.packageVariants.find((variant) => variant.isDefaultForStock) ?? item.packageVariants[0] ?? null;
};

export const resolveIngredientPickerRowContent = (item: IngredientSuggestionItem) => {
  const { primaryName: basePrimaryName, secondaryName: baseSecondaryName } = resolveIngredientDisplayNames(item);
  const consumableTechnicalData = resolveConsumableTechnicalData(item.technicalData);
  if (consumableTechnicalData) {
    const matchedVariant = resolveMatchedConsumablePackageVariant(item);
    const marketNames = resolveConsumableMarketNames(item.technicalData);
    const matchedVariantName = item.matchedPackageVariantName?.trim()
      || resolveConsumablePackageVariantName(matchedVariant);
    const promotedAlias = item.matchedAlias && shouldPromoteConsumableAlias(item, item.matchedAlias, marketNames)
      ? item.matchedAlias.trim()
      : null;
    const marketPrimaryName = buildConsumableMarketPrimaryLabel(item.technicalData, null);
    const primaryName = promotedAlias
      ?? marketPrimaryName
      ?? (item.matchType === "package" ? matchedVariantName : null)
      ?? basePrimaryName;
    const canonicalName = item.primaryLabelRu?.trim() || basePrimaryName;
    const secondaryName = consumableTechnicalData.pickerFunctionRu?.trim()
      || (normalizeSearchText(canonicalName) === normalizeSearchText(primaryName) ? baseSecondaryName : canonicalName);
    const subtitle = buildDedupedSubtitle([
      matchedVariant?.brand,
      formatConsumablePackageLabel(matchedVariant),
      consumableTechnicalData.pickerUsageRu,
      item.matchType === "package" && matchedVariantName && normalizeSearchText(matchedVariantName) !== normalizeSearchText(primaryName)
        ? matchedVariantName
        : null
    ]);

    return {
      primaryName,
      secondaryName,
      inlineBrand: null,
      country: null,
      subtitle
    };
  }

  const primaryName = basePrimaryName;
  const secondaryName = baseSecondaryName;
  const brandLabel = resolveIngredientBrandLabel(item);
  const inlineKindLabel = resolveIngredientFermentableKindLabel(item);
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
    inlineKindLabel,
    inlineBrand,
    country,
    subtitle
  };
};

type IngredientSelectionCardProps = {
  item: IngredientSuggestionItem;
  label?: string;
  className?: string;
  actionLabel?: string;
  onAction?: () => void;
  hideTypedSummary?: boolean;
  hideSubtitle?: boolean;
  mergeBrandAndCountry?: boolean;
  statusBadgeLabel?: string | null;
  details?: React.ReactNode;
};

export const IngredientSelectionCard = ({
  item,
  label = "Выбрано",
  className = "",
  actionLabel,
  onAction,
  hideTypedSummary = false,
  hideSubtitle = false,
  mergeBrandAndCountry = false,
  statusBadgeLabel = null,
  details
}: IngredientSelectionCardProps) => {
  const { primaryName, secondaryName, inlineKindLabel, inlineBrand, country, subtitle } = resolveIngredientPickerRowContent(item);
  const typedSummary = hideTypedSummary ? null : buildIngredientTypedSummary(item);
  const brandLabel = resolveIngredientBrandLabel(item);
  const ownershipBadgeLabel = resolveIngredientOwnershipBadgeLabel(item);
  const isGenericFermentable = item.type === "fermentable" && item.subtype === "fermentable";
  const topRowBrandLabel = mergeBrandAndCountry && !isGenericFermentable
    ? (inlineBrand ?? brandLabel)
    : inlineBrand;
  const lowerMetaSummary = hideSubtitle
    ? null
    : resolveIngredientPickerMetaSummary({
      subtitle,
      brandLabel: topRowBrandLabel ? null : brandLabel
    });

  return (
    <div className={`rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 ${className}`.trim()}>
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="text-xs font-medium text-zinc-500">
          {label}
        </div>
        <div className="flex items-center gap-2">
          {statusBadgeLabel ? (
            <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 ring-1 ring-amber-200">
              {statusBadgeLabel}
            </span>
          ) : null}
          {onAction && actionLabel ? (
            <button
              type="button"
              onClick={onAction}
              className="inline-flex shrink-0 items-center text-sm font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-4 transition-colors hover:text-zinc-950"
            >
              {actionLabel}
            </button>
          ) : null}
        </div>
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-zinc-950 sm:text-base">{primaryName}</span>
          {ownershipBadgeLabel ? (
            <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 ring-1 ring-amber-200">
              {ownershipBadgeLabel}
            </span>
          ) : null}
          {topRowBrandLabel ? (
            <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-zinc-700">
              <span aria-hidden="true" className="text-zinc-400">•</span>
              <span className="truncate">{topRowBrandLabel}</span>
              {mergeBrandAndCountry && country ? (
                <CountryFlag countryCode={country.code} className="h-3 w-4" />
              ) : null}
            </span>
          ) : null}
          {inlineKindLabel ? (
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-600 ring-1 ring-zinc-200">
              {inlineKindLabel}
            </span>
          ) : null}
        </div>
        {secondaryName ? <div className="mt-0.5 text-xs text-zinc-500">{secondaryName}</div> : null}
        {isGenericFermentable ? (
          <div className="mt-2">
            <IngredientPickerMetaLine
              brandLabel={brandLabel}
              country={country}
              summary={lowerMetaSummary}
            />
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
          {country && !mergeBrandAndCountry && !isGenericFermentable ? (
            <span className="inline-flex items-center rounded-full bg-white px-2 py-1 ring-1 ring-zinc-200">
              <CountryFlagLabel
                countryCode={country.code}
                label={country.label}
                iconClassName="h-3 w-4"
                className="gap-1"
              />
            </span>
          ) : null}
          {mergeBrandAndCountry || topRowBrandLabel || !brandLabel || isGenericFermentable ? null : (
            <span className="rounded-full bg-white px-2 py-1 ring-1 ring-zinc-200">{brandLabel}</span>
          )}
          {typedSummary ? (
            <span className="rounded-full bg-white px-2 py-1 font-medium text-zinc-700 ring-1 ring-zinc-200">
              {typedSummary}
            </span>
          ) : null}
          {!hideSubtitle && !isGenericFermentable && subtitle && subtitle !== typedSummary ? (
            <span className="text-zinc-500">{subtitle}</span>
          ) : null}
        </div>
        {details ? (
          <div className="mt-3 border-t border-zinc-200 pt-3">
            {details}
          </div>
        ) : null}
      </div>
    </div>
  );
};

type IngredientPickerScopePillProps = {
  label: string;
  removeLabel: string;
  onRemove: () => void;
  testId?: string;
};

const IngredientPickerScopePill = ({
  label,
  removeLabel,
  onRemove,
  testId
}: IngredientPickerScopePillProps) => (
  <button
    type="button"
    onPointerDown={(event) => event.preventDefault()}
    onClick={onRemove}
    data-testid={testId}
    className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-3 py-1.5 text-xs font-medium text-white"
    aria-label={removeLabel}
  >
    <span>{label}</span>
    <span aria-hidden="true" className="text-zinc-300">×</span>
  </button>
);

export const IngredientPickerManufacturerChip = ({
  refinement,
  onRemove
}: {
  refinement: IngredientManufacturerRefinement;
  onRemove: () => void;
}) => (
  <IngredientPickerScopePill
    label={refinement.label}
    removeLabel={`Убрать производителя ${refinement.label}`}
    onRemove={onRemove}
    testId="ingredient-picker-manufacturer-chip"
  />
);

const IngredientPickerGroupChip = ({
  refinement,
  onRemove
}: {
  refinement: IngredientConsumableGroupRefinement;
  onRemove: () => void;
}) => (
  <IngredientPickerScopePill
    label={refinement.label}
    removeLabel={`Убрать группу ${refinement.label}`}
    onRemove={onRemove}
    testId="ingredient-picker-group-chip"
  />
);

export const IngredientPickerFamilyChip = ({
  family,
  onRemove
}: {
  family: IngredientSearchFamilyScope;
  onRemove: () => void;
}) => (
  <IngredientPickerScopePill
    label={family.label}
    removeLabel={`Убрать семейство ${family.label}`}
    onRemove={onRemove}
    testId="ingredient-picker-family-chip"
  />
);

export const IngredientPickerFavoritesChip = ({
  onRemove
}: {
  onRemove: () => void;
}) => (
  <IngredientPickerScopePill
    label="Избранные"
    removeLabel="Убрать фильтр Избранные"
    onRemove={onRemove}
    testId="ingredient-picker-favorites-chip"
  />
);

export const shouldAllowIngredientFavoritesFilter = ({
  enableQuickStart = false,
  category,
  subtype,
  hasFavoritesInCategory = false
}: {
  enableQuickStart?: boolean;
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  hasFavoritesInCategory?: boolean;
}) => (
  enableQuickStart
  && category === "fermentable"
  && subtype === "malt"
  && hasFavoritesInCategory
);

export const shouldAllowIngredientCustomOnlyFilter = ({
  allowCustomOnlyFilter = false,
  includeCustom = true,
  hasCustomItemsInCategory = false
}: {
  allowCustomOnlyFilter?: boolean;
  includeCustom?: boolean;
  hasCustomItemsInCategory?: boolean;
}) => (
  allowCustomOnlyFilter
  && includeCustom !== false
  && hasCustomItemsInCategory
);

export const IngredientPickerCustomOnlyChip = ({
  onRemove
}: {
  onRemove: () => void;
}) => (
  <IngredientPickerScopePill
    label="Только свои"
    removeLabel="Убрать фильтр Только свои"
    onRemove={onRemove}
    testId="ingredient-picker-custom-only-chip"
  />
);

const IngredientPickerQuickFilterButton = ({
  label,
  leadingIcon,
  onClick,
  testId
}: {
  label: React.ReactNode;
  leadingIcon?: React.ReactNode;
  onClick: () => void;
  testId?: string;
}) => (
  <button
    type="button"
    onPointerDown={(event) => event.preventDefault()}
    onClick={onClick}
    data-testid={testId}
    className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-800 transition-colors hover:border-zinc-300 hover:bg-zinc-100"
  >
    {leadingIcon ? <span aria-hidden="true" className="mr-1 text-[11px] text-amber-600">{leadingIcon}</span> : null}
    {label}
  </button>
);

export const IngredientPickerScopeResetButton = ({
  onClick
}: {
  onClick: () => void;
}) => (
  <button
    type="button"
    onPointerDown={(event) => event.preventDefault()}
    onClick={onClick}
    data-testid="ingredient-picker-clear-all-scopes"
    className="text-xs font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-4 transition-colors hover:text-zinc-950"
  >
    Сбросить всё
  </button>
);

export const ingredientPickerCollapsedRecentCount = 0;

export const resolveIngredientPickerVisibleRecentItems = ({
  recent,
  showAllRecent
}: {
  recent: IngredientSuggestionItem[];
  showAllRecent: boolean;
}) => (
  showAllRecent
    ? recent.slice(0, ingredientPickerExpandedRecentCount)
    : recent.slice(0, ingredientPickerCollapsedRecentCount)
);

export const shouldShowIngredientPickerRecentExpandAction = ({
  recentCount
}: {
  recentCount: number;
}) => recentCount > ingredientPickerCollapsedRecentCount;

export const IngredientPickerQuickStartPanel = ({
  brands,
  recent,
  recentState,
  onSelectItem,
  onSelectBrand,
  onSelectFamily,
  onToggleFavorites,
  onToggleCustomOnly,
  showFavoritesFilter = true,
  showCustomOnlyFilter = false
}: {
  brands: IngredientManufacturerRefinement[];
  recent: IngredientSuggestionItem[];
  recentState?: "idle" | "loading" | "empty" | "ready";
  onSelectItem: (item: IngredientSuggestionItem) => void;
  onSelectBrand: (brand: IngredientManufacturerRefinement) => void;
  onSelectFamily: (familyKey: (typeof ingredientPickerMaltQuickStartFamilies)[number]["key"]) => void;
  onToggleFavorites: () => void;
  onToggleCustomOnly?: () => void;
  showFavoritesFilter?: boolean;
  showCustomOnlyFilter?: boolean;
}) => {
  const [showAllRecent, setShowAllRecent] = useState(false);
  const resolvedRecentState = recentState ?? (recent.length > 0 ? "ready" : "idle");
  const visibleRecent = resolveIngredientPickerVisibleRecentItems({
    recent,
    showAllRecent
  });
  const showRecentToggle = shouldShowIngredientPickerRecentExpandAction({
    recentCount: recent.length
  });
  const showRecentSection = resolvedRecentState !== "idle";

  return (
    <div
      className="min-h-[12rem] rounded-md border border-zinc-200 bg-white shadow-sm"
      data-testid="ingredient-picker-quick-start"
    >
      <div className="space-y-4 px-3 py-3">
        {showFavoritesFilter || (showCustomOnlyFilter && onToggleCustomOnly) ? (
          <div
            className="flex flex-wrap items-center gap-2"
            data-testid="ingredient-picker-quick-start-favorites"
          >
            {showFavoritesFilter ? (
              <IngredientPickerQuickFilterButton
                label="Только избранные"
                leadingIcon="★"
                onClick={onToggleFavorites}
                testId="ingredient-picker-favorites-filter"
              />
            ) : null}
            {showCustomOnlyFilter && onToggleCustomOnly ? (
              <IngredientPickerQuickFilterButton
                label="Только свои"
                onClick={onToggleCustomOnly}
                testId="ingredient-picker-custom-only-filter"
              />
            ) : null}
          </div>
        ) : null}

        {brands.length > 0 ? (
          <section className="space-y-2" data-testid="ingredient-picker-quick-start-brands">
            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
              По бренду
            </div>
            <div className="flex flex-wrap gap-2" data-testid="ingredient-picker-quick-start-brand-row">
              {brands.map((brand) => (
                <IngredientPickerQuickFilterButton
                  key={brand.normalizedLabel}
                  label={brand.label}
                  onClick={() => onSelectBrand(brand)}
                  testId="ingredient-picker-quick-start-brand-chip"
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-2" data-testid="ingredient-picker-quick-start-types">
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
            По типу
          </div>
          <div className="flex flex-wrap gap-2" data-testid="ingredient-picker-quick-start-type-row">
            {ingredientPickerMaltQuickStartFamilies.map((family) => (
              <IngredientPickerQuickFilterButton
                key={family.key}
                label={family.label}
                onClick={() => onSelectFamily(family.key)}
                testId="ingredient-picker-quick-start-type-chip"
              />
            ))}
          </div>
        </section>

        {showRecentSection ? (
          <section
            className="space-y-2"
            data-testid="ingredient-picker-quick-start-recent"
          >
            {resolvedRecentState === "ready" && showRecentToggle ? (
              <button
                type="button"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => setShowAllRecent((current) => !current)}
                data-testid="ingredient-picker-quick-start-recent-toggle"
                aria-expanded={showAllRecent}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span className="text-xs font-semibold text-zinc-900">
                  Недавние ({recent.length})
                </span>
                <span className="text-xs font-medium text-zinc-700">
                  {showAllRecent ? "Скрыть" : "Показать все"}
                </span>
              </button>
            ) : (
              <div className="flex min-h-[1.5rem] items-center">
                <span className="text-xs font-semibold text-zinc-900">
                  {resolvedRecentState === "ready" ? `Недавние (${recent.length})` : "Недавние"}
                </span>
              </div>
            )}
            {resolvedRecentState === "loading" ? (
              <div
                className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500"
                data-testid="ingredient-picker-quick-start-recent-loading"
              >
                Загружаем недавние...
              </div>
            ) : null}
            {resolvedRecentState === "empty" ? (
              <div
                className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500"
                data-testid="ingredient-picker-quick-start-recent-empty"
              >
                Последние выбранные ингредиенты появятся здесь.
              </div>
            ) : null}
            {resolvedRecentState === "ready" && showAllRecent ? (
              <div
                className="mt-3 grid gap-2 sm:grid-cols-2"
                data-testid="ingredient-picker-quick-start-recent-list"
              >
                {visibleRecent.map((item) => {
                  const { primaryName, inlineKindLabel, inlineBrand, country, subtitle } = resolveIngredientPickerRowContent(item);
                  const ownershipBadgeLabel = resolveIngredientOwnershipBadgeLabel(item);
                  const brandLabel = resolveIngredientBrandLabel(item);
                  const lowerMetaSummary = resolveIngredientPickerMetaSummary({
                    subtitle,
                    brandLabel: inlineBrand ? null : brandLabel
                  });

                  return (
                    <button
                      key={`${item.source}:${item.id}`}
                      type="button"
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => onSelectItem(item)}
                      data-testid="ingredient-picker-quick-start-recent-item"
                      className="rounded-lg border border-zinc-200 bg-white/90 px-3 py-2 text-left transition-colors hover:border-zinc-300 hover:bg-white"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium text-zinc-950">
                            {primaryName}
                          </div>
                          {inlineKindLabel ? (
                            <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                              {inlineKindLabel}
                            </div>
                          ) : null}
                        </div>
                        {ownershipBadgeLabel ? (
                          <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 ring-1 ring-amber-200">
                            {ownershipBadgeLabel}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 min-w-0">
                        {inlineBrand ? (
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-zinc-500">
                            <span className="font-medium text-zinc-700">{inlineBrand}</span>
                            {country ? (
                              <CountryFlag
                                countryCode={country.code}
                                className="h-2.5 w-3 shrink-0 ring-0"
                              />
                            ) : null}
                            {subtitle ? (
                              <>
                                <span aria-hidden="true">•</span>
                                <span className="truncate">{subtitle}</span>
                              </>
                            ) : null}
                          </div>
                        ) : (
                          <IngredientPickerMetaLine
                            brandLabel={brandLabel}
                            country={country}
                            summary={lowerMetaSummary}
                            compact
                          />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
};

const emptyIngredientSearchResult: IngredientSearchResult = {
  items: [],
  refinements: [],
  total: 0,
  isBroadMatch: false,
  hasMore: false,
  appliedManufacturer: null,
  appliedGroup: null,
  appliedFamily: null,
  appliedFavoritesOnly: false,
  appliedCustomOnly: false
};

const defaultSearchIngredients = async ({
  q,
  type,
  category,
  subtype,
  family,
  group,
  manufacturer,
  favoritesOnly,
  customOnly,
  includeCustom,
  limit,
  signal
}: {
  q: string;
  type?: IngredientType;
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  family?: string;
  group?: string;
  manufacturer?: string;
  favoritesOnly?: boolean;
  customOnly?: boolean;
  includeCustom?: boolean;
  limit: number;
  signal: AbortSignal;
}) => {
  const params = buildIngredientSearchParams({ q, type, category, subtype, family, group, manufacturer, favoritesOnly, customOnly, includeCustom, limit });
  const response = await fetch(`/api/ingredients/search?${params.toString()}`, { signal });
  if (!response.ok) {
    return {
      ...emptyIngredientSearchResult,
      appliedManufacturer: manufacturer ? {
        type: "manufacturer" as const,
        label: manufacturer,
        normalizedLabel: normalizeSearchText(manufacturer),
        value: manufacturer,
        count: 0,
        score: 0
      } : null,
      appliedGroup: group ? {
        type: "consumable_group" as const,
        label: group,
        normalizedLabel: normalizeSearchText(group),
        value: group,
        count: 0,
        score: 0
      } : null,
      appliedFamily: resolveIngredientPickerQuickStartFamilyScope(family ?? null),
      appliedFavoritesOnly: favoritesOnly ?? false,
      appliedCustomOnly: customOnly ?? false
    };
  }
  return await response.json() as IngredientSearchResult;
};

const readStoredIngredientPickerRecentSelections = () => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(ingredientPickerQuickStartRecentStorageKey);
    if (!raw) {
      return [];
    }

    return sanitizeIngredientPickerStoredRecentSelections(JSON.parse(raw));
  } catch {
    return [];
  }
};

const persistIngredientPickerRecentSelections = (
  item: Pick<IngredientSuggestionItem, "source" | "id" | "category" | "subtype">,
  options?: {
    fallbackCategory?: IngredientCategory;
    fallbackSubtype?: IngredientSubtype | null;
  }
) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const current = readStoredIngredientPickerRecentSelections();
    const next = upsertIngredientPickerRecentSelections(current, item, {
      fallbackCategory: options?.fallbackCategory,
      fallbackSubtype: options?.fallbackSubtype
    });
    window.localStorage.setItem(ingredientPickerQuickStartRecentStorageKey, JSON.stringify(next));
  } catch {
    // Ignore storage failures; quick-start can still work without recent history.
  }
};

const resolveIngredientPickerQuickStartSeedData = ({
  category,
  subtype
}: {
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
}): IngredientPickerQuickStartResult => ({
  brands: category === "fermentable" && subtype === "malt"
    ? ingredientPickerMaltQuickStartFallbackBrands.slice(0, ingredientPickerQuickStartBrandLimit)
    : [],
  recent: []
});

const defaultLoadQuickStartIngredients = async ({
  category,
  subtype,
  recentReferences,
  signal
}: {
  category: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  recentReferences: UserIngredientReference[];
  signal: AbortSignal;
}) => {
  const response = await fetch("/api/ingredients/picker-quick-start", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      category,
      subtype: subtype ?? null,
      recentReferences,
      recentLimit: ingredientPickerExpandedRecentCount
    })
  });

  if (!response.ok) {
    return resolveIngredientPickerQuickStartSeedData({
      category,
      subtype
    });
  }

  return await response.json() as IngredientPickerQuickStartResult;
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
  focusSignal = 0,
  onSelect,
  onValueChange,
  onSelectionInvalidated,
  onCreateIngredient,
  placeholder = "Search ingredient",
  emptyCta,
  allowCatalogProposal = true,
  includeCustom = true,
  allowCustomOnlyFilter = false,
  enableQuickStart = false,
  proposeIngredient = defaultProposeIngredient,
  searchIngredients = defaultSearchIngredients,
  loadQuickStartIngredients = defaultLoadQuickStartIngredients
}: Props) => {
  const [query, setQuery] = useState(value ?? "");
  const [searchResult, setSearchResult] = useState<IngredientSearchResult>(emptyIngredientSearchResult);
  const [quickStartData, setQuickStartData] = useState<IngredientPickerQuickStartResult>(() => (
    resolveIngredientPickerQuickStartSeedData({
      category,
      subtype
    })
  ));
  const [recentSelections, setRecentSelections] = useState<IngredientPickerStoredRecentSelection[]>([]);
  const [hasHydratedRecentSelections, setHasHydratedRecentSelections] = useState(false);
  const [activeQuickStartFamily, setActiveQuickStartFamily] = useState<IngredientSearchFamilyScope | null>(null);
  const [activeGroup, setActiveGroup] = useState<IngredientConsumableGroupRefinement | null>(null);
  const [activeManufacturer, setActiveManufacturer] = useState<IngredientManufacturerRefinement | null>(null);
  const [activeFavoritesOnly, setActiveFavoritesOnly] = useState(false);
  const [activeCustomOnly, setActiveCustomOnly] = useState(false);
  const [hasFavoritesInCategory, setHasFavoritesInCategory] = useState(false);
  const [hasCustomItemsInCategory, setHasCustomItemsInCategory] = useState(false);
  const [isQuickStartRecentLoading, setIsQuickStartRecentLoading] = useState(false);
  const [suppressQuickStart, setSuppressQuickStart] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasResolvedQuery, setHasResolvedQuery] = useState(false);
  const [emptyStateMessage, setEmptyStateMessage] = useState<string | null>(null);
  const cacheRef = useRef(new Map<string, IngredientSearchResult>());
  const quickStartCacheRef = useRef(new Map<string, IngredientPickerQuickStartResult>());
  const favoritesAvailabilityCacheRef = useRef(new Map<string, boolean>());
  const customAvailabilityCacheRef = useRef(new Map<string, boolean>());
  const committedLabelRef = useRef(value ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listboxId = useId();
  const activeGroupValue = activeGroup?.value ?? undefined;
  const activeGroupKey = activeGroup?.normalizedLabel ?? "";
  const activeManufacturerLabel = activeManufacturer?.label ?? undefined;
  const activeManufacturerKey = activeManufacturer?.normalizedLabel ?? "";
  const activeQuickStartFamilyKey = activeQuickStartFamily?.key ?? "";
  const appliedGroup = searchResult.appliedGroup ?? activeGroup;
  const appliedManufacturer = searchResult.appliedManufacturer ?? activeManufacturer;
  const appliedQuickStartFamily = searchResult.appliedFamily ?? activeQuickStartFamily;
  const appliedFavoritesOnly = searchResult.appliedFavoritesOnly || activeFavoritesOnly;
  const appliedCustomOnly = searchResult.appliedCustomOnly || activeCustomOnly;
  const quickStartRecentReferences = useMemo(() => filterIngredientPickerRecentReferencesForContext({
    selections: recentSelections,
    category,
    subtype,
    limit: ingredientPickerExpandedRecentCount
  }), [category, recentSelections, subtype]);
  const quickStartRecentReferencesKey = quickStartRecentReferences
    .map((reference) => `${reference.source}:${reference.id}`)
    .join("|");
  const effectiveSearchQuery = resolveIngredientPickerSearchQuery({
    query,
    activeManufacturer: appliedManufacturer,
    activeGroup: appliedGroup,
    activeFamily: appliedQuickStartFamily
  });
  const activeScopeCount = countIngredientPickerActiveScopes({
    activeFamily: appliedQuickStartFamily,
    activeGroup: appliedGroup,
    activeManufacturer: appliedManufacturer,
    activeFavoritesOnly: appliedFavoritesOnly,
    activeCustomOnly: appliedCustomOnly
  });
  const hasSearchScope = activeScopeCount > 0;
  const resetFilters = () => {
    setActiveQuickStartFamily(null);
    setActiveGroup(null);
    setActiveManufacturer(null);
    setActiveFavoritesOnly(false);
    setActiveCustomOnly(false);
    setSuppressQuickStart(false);
    setActiveIndex(0);
    setIsExpanded(false);
    setHasResolvedQuery(false);
    inputRef.current?.focus();
  };
  const showQuickStart = shouldShowIngredientQuickStart({
    enabled: enableQuickStart,
    category,
    subtype,
    query,
    hasExplicitSearchState: suppressQuickStart,
    hasActiveFamilyScope: Boolean(appliedQuickStartFamily),
    hasActiveFavoritesScope: appliedFavoritesOnly,
    hasActiveCustomScope: appliedCustomOnly,
    hasActiveManufacturer: Boolean(appliedManufacturer),
    hasActiveGroup: Boolean(appliedGroup)
  });
  const refinementMode = shouldUseIngredientRefinementMode({
    total: searchResult.total,
    refinements: searchResult.refinements,
    activeManufacturer: appliedManufacturer,
    activeGroup: appliedGroup
  });
  const visibleItems = useMemo(() => resolveVisibleIngredientItems({
    items: searchResult.items,
    isBroadMatch: searchResult.isBroadMatch,
    isExpanded
  }), [isExpanded, searchResult.isBroadMatch, searchResult.items]);

  useEffect(() => {
    setQuery(value ?? "");
    committedLabelRef.current = value ?? "";
    setIsOpen((current) => current && (
      Boolean((value ?? "").trim())
      || Boolean(activeManufacturerKey)
      || Boolean(activeGroupKey)
      || Boolean(activeQuickStartFamilyKey)
      || activeFavoritesOnly
      || activeCustomOnly
    ));
  }, [activeCustomOnly, activeFavoritesOnly, activeGroupKey, activeManufacturerKey, activeQuickStartFamilyKey, value]);

  useEffect(() => {
    setActiveQuickStartFamily(null);
    setActiveGroup(null);
    setActiveManufacturer(null);
    setActiveFavoritesOnly(false);
    setActiveCustomOnly(false);
    setHasFavoritesInCategory(false);
    setHasCustomItemsInCategory(false);
    setIsQuickStartRecentLoading(false);
    setSuppressQuickStart(false);
    setIsExpanded(false);
    setSearchResult(emptyIngredientSearchResult);
    setActiveIndex(0);
    setHasResolvedQuery(false);
  }, [category, includeCustom, subtype, type]);

  useEffect(() => {
    if (!category || subtype !== "malt" || category !== "fermentable" || !enableQuickStart) {
      setHasFavoritesInCategory(false);
      return;
    }

    const cacheKey = `${category}:${subtype ?? ""}`;
    const cached = favoritesAvailabilityCacheRef.current.get(cacheKey);
    if (typeof cached === "boolean") {
      setHasFavoritesInCategory(cached);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      category,
      favoritesOnly: "true",
      limit: "1"
    });

    if (subtype) {
      params.set("subtype", subtype);
    }

    const run = async () => {
      try {
        const response = await fetch(`/api/ingredients/search?${params.toString()}`, {
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error("Failed to load favorite ingredient availability.");
        }

        const data = await response.json() as { total?: number };
        if (controller.signal.aborted) {
          return;
        }

        const nextHasFavorites = typeof data.total === "number" && data.total > 0;
        favoritesAvailabilityCacheRef.current.set(cacheKey, nextHasFavorites);
        setHasFavoritesInCategory(nextHasFavorites);
      } catch (error) {
        if (isAbortError(error) || controller.signal.aborted) {
          return;
        }

        favoritesAvailabilityCacheRef.current.set(cacheKey, false);
        setHasFavoritesInCategory(false);
      }
    };

    void run();

    return () => controller.abort();
  }, [category, enableQuickStart, subtype]);

  useEffect(() => {
    if (!shouldAllowIngredientCustomOnlyFilter({
      allowCustomOnlyFilter,
      includeCustom,
      hasCustomItemsInCategory: true
    }) || !category) {
      setHasCustomItemsInCategory(false);
      return;
    }

    const cacheKey = `${category}:${subtype ?? ""}`;
    const cached = customAvailabilityCacheRef.current.get(cacheKey);
    if (typeof cached === "boolean") {
      setHasCustomItemsInCategory(cached);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      category,
      limit: "1"
    });

    if (subtype) {
      params.set("subtype", subtype);
    }

    const run = async () => {
      try {
        const response = await fetch(`/api/ingredients/custom?${params.toString()}`, {
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error("Failed to load custom ingredient availability.");
        }

        const data = await response.json() as { total?: number };
        if (controller.signal.aborted) {
          return;
        }

        const nextHasCustomItems = typeof data.total === "number" && data.total > 0;
        customAvailabilityCacheRef.current.set(cacheKey, nextHasCustomItems);
        setHasCustomItemsInCategory(nextHasCustomItems);
      } catch (error) {
        if (isAbortError(error) || controller.signal.aborted) {
          return;
        }

        customAvailabilityCacheRef.current.set(cacheKey, false);
        setHasCustomItemsInCategory(false);
      }
    };

    void run();

    return () => controller.abort();
  }, [allowCustomOnlyFilter, category, includeCustom, subtype]);

  useEffect(() => {
    if (normalizeSearchText(query).length === 0) {
      setSuppressQuickStart(false);
    }
  }, [query]);

  useEffect(() => {
    setQuickStartData(resolveIngredientPickerQuickStartSeedData({
      category,
      subtype
    }));
  }, [category, enableQuickStart, subtype]);

  useEffect(() => {
    setIsExpanded(false);
  }, [activeCustomOnly, activeFavoritesOnly, activeGroup?.normalizedLabel, activeManufacturer?.normalizedLabel, activeQuickStartFamily?.key, query]);

  useEffect(() => {
    if (!focusSignal) {
      return;
    }

    inputRef.current?.focus();
  }, [focusSignal]);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setRecentSelections(readStoredIngredientPickerRecentSelections());
    setHasHydratedRecentSelections(true);
  }, []);

  useEffect(() => {
    if (!shouldSearchIngredients({ isOpen, query: effectiveSearchQuery, hasSearchScope })) {
      setSearchResult({
        ...emptyIngredientSearchResult,
        appliedGroup: activeGroup,
        appliedManufacturer: activeManufacturer,
        appliedFamily: activeQuickStartFamily,
        appliedFavoritesOnly: activeFavoritesOnly,
        appliedCustomOnly: activeCustomOnly
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
      family: appliedQuickStartFamily?.key,
      group: activeGroupValue,
      manufacturer: activeManufacturerLabel,
      favoritesOnly: appliedFavoritesOnly,
      customOnly: appliedCustomOnly,
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
          family: appliedQuickStartFamily?.key,
          group: activeGroupValue,
          manufacturer: activeManufacturerLabel,
          favoritesOnly: appliedFavoritesOnly,
          customOnly: appliedCustomOnly,
          includeCustom,
          limit: requestedLimit,
          signal: controller.signal
        });
        if (controller.signal.aborted) {
          return;
        }

        const nextResult = normalizeIngredientSearchResponse(
          response,
          activeManufacturer,
          activeGroup,
          activeQuickStartFamily,
          activeFavoritesOnly,
          activeCustomOnly
        );
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
  }, [activeCustomOnly, activeFavoritesOnly, activeGroup, activeGroupKey, activeGroupValue, activeManufacturer, activeManufacturerKey, activeManufacturerLabel, activeQuickStartFamily, appliedQuickStartFamily?.key, category, effectiveSearchQuery, hasSearchScope, includeCustom, isExpanded, isOpen, limit, query, searchIngredients, subtype, type]);

  useEffect(() => {
    if (!showQuickStart || !category) {
      setIsQuickStartRecentLoading(false);
      return;
    }

    if (!hasHydratedRecentSelections) {
      setIsQuickStartRecentLoading(true);
      return;
    }

    const cacheKey = `${category}:${subtype ?? ""}:${quickStartRecentReferencesKey}`;
    const cached = quickStartCacheRef.current.get(cacheKey);
    if (cached) {
      setQuickStartData(cached);
      setIsQuickStartRecentLoading(false);
      return;
    }

    const controller = new AbortController();
    const run = async () => {
      try {
        setIsQuickStartRecentLoading(true);
        const nextQuickStartData = await loadQuickStartIngredients({
          category,
          subtype,
          recentReferences: quickStartRecentReferences,
          signal: controller.signal
        });
        if (controller.signal.aborted) {
          return;
        }

        quickStartCacheRef.current.set(cacheKey, nextQuickStartData);
        setQuickStartData(nextQuickStartData);
        setIsQuickStartRecentLoading(false);
      } catch (error) {
        if (isAbortError(error) || controller.signal.aborted) {
          return;
        }

        setQuickStartData(resolveIngredientPickerQuickStartSeedData({
          category,
          subtype
        }));
        setIsQuickStartRecentLoading(false);
      }
    };

    void run();

    return () => {
      controller.abort();
    };
  }, [category, hasHydratedRecentSelections, loadQuickStartIngredients, quickStartRecentReferences, quickStartRecentReferencesKey, showQuickStart, subtype]);

  const grouped = useMemo(() => visibleItems.reduce<Record<string, IngredientSuggestionItem[]>>((acc, item) => {
    const groupKey = item.category ?? item.type;
    acc[groupKey] ??= [];
    acc[groupKey].push(item);
    return acc;
  }, {}), [visibleItems]);

  const showGroupHeaders = !category && Object.keys(grouped).length > 1;

  const commitSelection = (item: IngredientSuggestionItem) => {
    if (enableQuickStart) {
      persistIngredientPickerRecentSelections(item, {
        fallbackCategory: category,
        fallbackSubtype: subtype ?? null
      });
      setRecentSelections((current) => upsertIngredientPickerRecentSelections(current, item, {
        fallbackCategory: category,
        fallbackSubtype: subtype ?? null
      }));
    }

    committedLabelRef.current = item.displayName;
    setQuery(item.displayName);
    setIsOpen(false);
    setSearchResult(emptyIngredientSearchResult);
    setActiveQuickStartFamily(null);
    setActiveGroup(null);
    setActiveManufacturer(null);
    setActiveFavoritesOnly(false);
    setActiveCustomOnly(false);
    setSuppressQuickStart(false);
    setActiveIndex(0);
    setIsExpanded(false);
    setIsLoading(false);
    setHasResolvedQuery(false);
    setEmptyStateMessage(null);
    onSelect(item);
  };

  const applyScopedSearchState = ({
    nextQuery = query,
    nextFamily = appliedQuickStartFamily,
    nextGroup = appliedGroup,
    nextManufacturer = appliedManufacturer,
    nextFavoritesOnly = appliedFavoritesOnly,
    nextCustomOnly = appliedCustomOnly,
    focusInput = false,
    syncInputValue = false
  }: {
    nextQuery?: string;
    nextFamily?: IngredientSearchFamilyScope | null;
    nextGroup?: IngredientConsumableGroupRefinement | null;
    nextManufacturer?: IngredientManufacturerRefinement | null;
    nextFavoritesOnly?: boolean;
    nextCustomOnly?: boolean;
    focusInput?: boolean;
    syncInputValue?: boolean;
  }) => {
    const nextScopedState = resolveIngredientPickerScopedState({
      activeScopeCount,
      nextQuery,
      nextFamily,
      nextGroup,
      nextManufacturer,
      nextFavoritesOnly,
      nextCustomOnly
    });
    setQuery(nextQuery);
    setActiveQuickStartFamily(nextFamily ?? null);
    setActiveGroup(nextGroup ?? null);
    setActiveManufacturer(nextManufacturer ?? null);
    setActiveFavoritesOnly(nextFavoritesOnly);
    setActiveCustomOnly(nextCustomOnly);
    setSuppressQuickStart(nextScopedState.suppressQuickStart);
    setSearchResult({
      ...emptyIngredientSearchResult,
      appliedFamily: nextFamily ?? null,
      appliedGroup: nextGroup ?? null,
      appliedManufacturer: nextManufacturer ?? null,
      appliedFavoritesOnly: nextFavoritesOnly,
      appliedCustomOnly: nextCustomOnly
    });
    setIsOpen(nextScopedState.isOpen);
    setActiveIndex(0);
    setIsExpanded(false);
    setIsLoading(false);
    setHasResolvedQuery(false);
    setEmptyStateMessage(null);
    if (
      committedLabelRef.current
      && normalizeSearchText(nextQuery) !== normalizeSearchText(committedLabelRef.current)
    ) {
      committedLabelRef.current = "";
      onSelectionInvalidated?.();
    }
    if (syncInputValue) {
      onValueChange?.(nextQuery);
    }
    if (focusInput) {
      inputRef.current?.focus();
    }
  };

  const handleQueryChange = (
    nextValue: string,
    options?: {
      nextFamily?: IngredientSearchFamilyScope | null;
      nextGroup?: IngredientConsumableGroupRefinement | null;
      nextManufacturer?: IngredientManufacturerRefinement | null;
      nextFavoritesOnly?: boolean;
      nextCustomOnly?: boolean;
    }
  ) => {
    setQuery(nextValue);
    if (normalizeSearchText(nextValue).length === 0) {
      setSuppressQuickStart(false);
    }
    const familyForOpen = options?.nextFamily ?? appliedQuickStartFamily;
    const groupForOpen = options?.nextGroup ?? appliedGroup;
    const manufacturerForOpen = options?.nextManufacturer ?? appliedManufacturer;
    const favoritesForOpen = options?.nextFavoritesOnly ?? appliedFavoritesOnly;
    const customForOpen = options?.nextCustomOnly ?? appliedCustomOnly;
    setIsOpen(
      Boolean(nextValue.trim())
      || Boolean(familyForOpen)
      || Boolean(groupForOpen)
      || Boolean(manufacturerForOpen)
      || favoritesForOpen
      || customForOpen
    );
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

  const activateQuickStartBrand = (brand: IngredientManufacturerRefinement) => {
    applyScopedSearchState({
      nextQuery: query,
      nextFamily: appliedQuickStartFamily,
      nextGroup: appliedGroup,
      nextManufacturer: brand,
      nextFavoritesOnly: appliedFavoritesOnly,
      nextCustomOnly: appliedCustomOnly,
      focusInput: true,
      syncInputValue: true
    });
  };

  const activateQuickStartFamily = (familyKey: string) => {
    const nextFamily = resolveIngredientPickerQuickStartFamilyScope(familyKey);
    if (!nextFamily) {
      return;
    }

    applyScopedSearchState({
      nextQuery: "",
      nextFamily,
      nextGroup: appliedGroup,
      nextManufacturer: appliedManufacturer,
      nextFavoritesOnly: appliedFavoritesOnly,
      nextCustomOnly: appliedCustomOnly,
      focusInput: true,
      syncInputValue: true
    });
  };

  const clearQuickStartFamily = () => {
    applyScopedSearchState({
      nextFamily: null,
      nextGroup: appliedGroup,
      nextManufacturer: appliedManufacturer,
      nextFavoritesOnly: appliedFavoritesOnly,
      nextCustomOnly: appliedCustomOnly,
      focusInput: true
    });
  };

  const clearGroupFilter = () => {
    applyScopedSearchState({
      nextFamily: appliedQuickStartFamily,
      nextGroup: null,
      nextManufacturer: appliedManufacturer,
      nextFavoritesOnly: appliedFavoritesOnly,
      nextCustomOnly: appliedCustomOnly
    });
  };

  const clearManufacturerFilter = () => {
    applyScopedSearchState({
      nextFamily: appliedQuickStartFamily,
      nextGroup: appliedGroup,
      nextManufacturer: null,
      nextFavoritesOnly: appliedFavoritesOnly,
      nextCustomOnly: appliedCustomOnly
    });
  };

  const toggleFavoritesFilter = () => {
    applyScopedSearchState({
      nextFamily: appliedQuickStartFamily,
      nextGroup: appliedGroup,
      nextManufacturer: appliedManufacturer,
      nextFavoritesOnly: !appliedFavoritesOnly,
      nextCustomOnly: appliedCustomOnly,
      focusInput: true
    });
  };

  const clearFavoritesFilter = () => {
    applyScopedSearchState({
      nextFamily: appliedQuickStartFamily,
      nextGroup: appliedGroup,
      nextManufacturer: appliedManufacturer,
      nextFavoritesOnly: false,
      nextCustomOnly: appliedCustomOnly,
      focusInput: true
    });
  };

  const toggleCustomOnlyFilter = () => {
    applyScopedSearchState({
      nextFamily: appliedQuickStartFamily,
      nextGroup: appliedGroup,
      nextManufacturer: appliedManufacturer,
      nextFavoritesOnly: appliedFavoritesOnly,
      nextCustomOnly: !appliedCustomOnly,
      focusInput: true
    });
  };

  const clearCustomOnlyFilter = () => {
    applyScopedSearchState({
      nextFamily: appliedQuickStartFamily,
      nextGroup: appliedGroup,
      nextManufacturer: appliedManufacturer,
      nextFavoritesOnly: appliedFavoritesOnly,
      nextCustomOnly: false,
      focusInput: true
    });
  };

  const clearAllScopes = () => {
    applyScopedSearchState({
      nextFamily: null,
      nextGroup: null,
      nextManufacturer: null,
      nextFavoritesOnly: false,
      nextCustomOnly: false,
      focusInput: true
    });
  };

  const showSuggestions = shouldShowIngredientSuggestions({
    isOpen,
    itemsCount: visibleItems.length,
    refinementsCount: refinementMode ? searchResult.refinements.length : 0
  });
  const isLoadingVisible = shouldShowIngredientLoadingState({
    hasResolvedQuery,
    isOpen,
    query: effectiveSearchQuery,
    hasSearchScope
  });
  const loadingLabel = resolveIngredientPickerLoadingLabel({
    query: effectiveSearchQuery,
    hasSearchScope
  });
  const showEmptyState = shouldShowIngredientEmptyState({
    hasResolvedQuery,
    isLoading,
    isOpen,
    itemsCount: searchResult.items.length,
    refinementsCount: searchResult.refinements.length,
    query: effectiveSearchQuery,
    hasSearchScope
  });
  const showExpandControl = !isExpanded && (
    searchResult.hasMore
    || visibleItems.length < searchResult.items.length
  );
  const activeScopeLabels = [
    appliedQuickStartFamily?.label ?? null,
    appliedManufacturer?.label ?? null,
    appliedGroup?.label ?? null,
    appliedFavoritesOnly ? "Избранные" : null,
    appliedCustomOnly ? "Только свои" : null
  ].filter((label): label is string => Boolean(label));
  const showScopeReset = shouldShowIngredientScopeReset({
    activeScopeCount
  });
  const activeSearchContextLabel = activeScopeLabels.length === 1
    ? activeScopeLabels[0] ?? null
    : activeScopeLabels.length > 1
      ? "выбранные фильтры"
      : null;
  const canShowFavoritesFilter = shouldAllowIngredientFavoritesFilter({
    enableQuickStart,
    category,
    subtype,
    hasFavoritesInCategory
  });
  const showResultsFavoritesQuickFilter = canShowFavoritesFilter
    && !showQuickStart
    && !appliedFavoritesOnly;
  const canShowCustomOnlyFilter = shouldAllowIngredientCustomOnlyFilter({
    allowCustomOnlyFilter,
    includeCustom,
    hasCustomItemsInCategory
  });
  const showResultsCustomOnlyQuickFilter = canShowCustomOnlyFilter
    && !showQuickStart
    && !appliedCustomOnly;
  const currentRefinementType = searchResult.refinements[0]?.type ?? null;
  const refinementPanelTitle = currentRefinementType === "consumable_group"
    ? "Уточнить группу расходников"
    : "Уточнить производителя";
  const ingredientSectionTitle = activeScopeCount > 1
    ? "Результаты по выбранным фильтрам"
    : activeSearchContextLabel
      ? `Результаты: ${activeSearchContextLabel}`
      : refinementMode
        ? "Лучшие совпадения"
        : null;
  const inputPlaceholder = resolveIngredientPickerScopedPlaceholder({
    placeholder,
    query,
    activeManufacturerLabel: appliedManufacturer?.label ?? null,
    activeGroupLabel: appliedGroup?.label ?? null,
    activeFamilyLabel: appliedQuickStartFamily?.label ?? null,
    activeFavoritesOnly: appliedFavoritesOnly,
    activeCustomOnly: appliedCustomOnly
  });
  const emptyStateQueryLabel = query.trim() || activeSearchContextLabel || effectiveSearchQuery.trim();
  const expandedResultsSummary = isExpanded && searchResult.total > searchResult.items.length
    ? `Показаны первые ${searchResult.items.length} из ${searchResult.total} совпадений. Уточните запрос или используйте фильтры.`
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

  const suggestionsPanel = showSuggestions ? (
    <div className="min-h-[12rem] rounded-md border border-zinc-200 bg-white shadow-sm">
      {refinementMode ? (
        <div className="border-b border-zinc-200 px-3 py-3" data-testid="ingredient-picker-refinements">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-xs font-medium text-zinc-500">
              {refinementPanelTitle}
            </div>
            <div className="text-xs text-zinc-500">
              {searchResult.total} совпадений
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {searchResult.refinements.map((refinement) => (
              <button
                key={`${refinement.type}:${refinement.normalizedLabel}`}
                type="button"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (refinement.type === "manufacturer") {
                    const rewrittenQuery = rewriteIngredientQueryForManufacturer({
                      query,
                      manufacturer: refinement.label
                    });
                    setActiveManufacturer(refinement);
                    handleQueryChange(rewrittenQuery, {
                      nextFamily: appliedQuickStartFamily,
                      nextGroup: appliedGroup,
                      nextManufacturer: refinement,
                      nextFavoritesOnly: appliedFavoritesOnly
                    });
                  } else {
                    setActiveGroup(refinement);
                    setActiveManufacturer(null);
                    handleQueryChange(query, {
                      nextGroup: refinement,
                      nextManufacturer: null,
                      nextFavoritesOnly: appliedFavoritesOnly
                    });
                  }
                  setActiveIndex(0);
                  setIsExpanded(false);
                  setEmptyStateMessage(null);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-800 transition-colors hover:border-zinc-300 hover:bg-zinc-100"
                title={refinement.description ?? undefined}
              >
                <span>{refinement.label}</span>
                <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-zinc-500 ring-1 ring-zinc-200">
                  {refinement.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {visibleItems.length > 0 ? (
        <div id={listboxId} role="listbox">
          {ingredientSectionTitle ? (
            <div className="flex items-center justify-between gap-3 bg-zinc-50 px-3 py-1 text-xs text-zinc-500">
              <span>{ingredientSectionTitle}</span>
              <span className="text-zinc-400">
                {searchResult.total}
              </span>
            </div>
          ) : null}

          {Object.entries(grouped).map(([group, groupItems]) => (
            <div key={group} className="border-b last:border-b-0">
              {showGroupHeaders ? (
                <div className="bg-zinc-50 px-3 py-1 text-xs text-zinc-500">
                  {ingredientCategoryLabels[group as IngredientCategory] ?? group}
                </div>
              ) : null}
              {groupItems.map((item) => {
                const index = visibleItems.findIndex((candidate) => (
                  candidate.id === item.id
                  && candidate.source === item.source
                ));
                const { primaryName, secondaryName, inlineKindLabel, inlineBrand, country, subtitle } = resolveIngredientPickerRowContent(item);
                const ownershipBadgeLabel = resolveIngredientOwnershipBadgeLabel(item);
                const brandLabel = resolveIngredientBrandLabel(item);
                const lowerMetaSummary = resolveIngredientPickerMetaSummary({
                  subtitle,
                  brandLabel: inlineBrand ? null : brandLabel
                });

                return (
                  <div
                    key={`${item.source}:${item.id}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={`px-3 py-2 text-sm hover:bg-zinc-100 ${index === activeIndex ? "bg-zinc-100" : ""}`}
                    onPointerDown={(event) => event.preventDefault()}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => commitSelection(item)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-medium text-zinc-950">{primaryName}</span>
                            {ownershipBadgeLabel ? (
                              <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 ring-1 ring-amber-200">
                                {ownershipBadgeLabel}
                              </span>
                            ) : null}
                            {inlineKindLabel ? (
                              <span className="truncate rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-600 ring-1 ring-zinc-200">
                                {inlineKindLabel}
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
                          {inlineBrand ? (
                            country || subtitle ? (
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
                            ) : null
                          ) : (
                            <IngredientPickerMetaLine
                              brandLabel={brandLabel}
                              country={country}
                              summary={lowerMetaSummary}
                            />
                          )}
                        </div>
                      </button>
                      <IngredientFavoriteToggle
                        reference={{
                          source: item.source,
                          id: item.id
                        }}
                        initialFavorite={item.isFavorite ?? false}
                        suppressParentInteraction
                        label={item.isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
                      />
                    </div>
                  </div>
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
  ) : null;

  const showStandaloneLoadingPanel = isLoadingVisible && !showSuggestions;
  const loadingPanel = showStandaloneLoadingPanel ? (
    <IngredientPickerLoadingState label={loadingLabel} />
  ) : null;

  const emptyStatePanel = showEmptyState ? (
    emptyCta ? (
      <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50 px-3 py-3 shadow-sm">
        {typeof emptyCta === "function"
          ? emptyCta({
            hasActiveFilters: hasSearchScope,
            resetFilters
          })
          : emptyCta}
      </div>
    ) : builtInEmptyState
  ) : null;
  const quickStartPanel = showQuickStart ? (
    <IngredientPickerQuickStartPanel
      brands={quickStartData.brands}
      recent={quickStartData.recent}
      recentState={
        !hasHydratedRecentSelections || isQuickStartRecentLoading
          ? "loading"
          : quickStartData.recent.length > 0
            ? "ready"
            : "empty"
      }
      onSelectItem={commitSelection}
      onSelectBrand={activateQuickStartBrand}
      onSelectFamily={activateQuickStartFamily}
      onToggleFavorites={toggleFavoritesFilter}
      onToggleCustomOnly={toggleCustomOnlyFilter}
      showFavoritesFilter={canShowFavoritesFilter}
      showCustomOnlyFilter={canShowCustomOnlyFilter}
    />
  ) : null;

  return (
    <div ref={rootRef} className="space-y-2">
      {activeScopeCount > 0 || showResultsFavoritesQuickFilter || showResultsCustomOnlyQuickFilter ? (
        <div className="flex flex-wrap items-center gap-2">
          {appliedQuickStartFamily ? (
            <IngredientPickerFamilyChip
              family={appliedQuickStartFamily}
              onRemove={clearQuickStartFamily}
            />
          ) : null}
          {appliedManufacturer ? (
            <IngredientPickerManufacturerChip
              refinement={appliedManufacturer}
              onRemove={clearManufacturerFilter}
            />
          ) : null}
          {appliedGroup ? (
            <IngredientPickerGroupChip
              refinement={appliedGroup}
              onRemove={clearGroupFilter}
            />
          ) : null}
          {appliedFavoritesOnly ? (
            <IngredientPickerFavoritesChip
              onRemove={clearFavoritesFilter}
            />
          ) : null}
          {appliedCustomOnly ? (
            <IngredientPickerCustomOnlyChip
              onRemove={clearCustomOnlyFilter}
            />
          ) : null}
          {showResultsFavoritesQuickFilter ? (
            <IngredientPickerQuickFilterButton
              label="Только избранные"
              onClick={toggleFavoritesFilter}
              testId="ingredient-picker-favorites-filter"
            />
          ) : null}
          {showResultsCustomOnlyQuickFilter ? (
            <IngredientPickerQuickFilterButton
              label="Только свои"
              onClick={toggleCustomOnlyFilter}
              testId="ingredient-picker-custom-only-filter"
            />
          ) : null}
          {showScopeReset ? (
            <IngredientPickerScopeResetButton onClick={clearAllScopes} />
          ) : null}
        </div>
      ) : null}
      <div className="space-y-2">
        <div className="relative">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              handleQueryChange(event.target.value);
            }}
            autoFocus={autoFocus}
            onFocus={() => setIsOpen(
              Boolean(normalizeSearchText(query))
              || Boolean(appliedManufacturer)
              || Boolean(appliedGroup)
              || Boolean(appliedQuickStartFamily)
              || appliedFavoritesOnly
              || appliedCustomOnly
            )}
            onBlur={() => {
              if (blurTimeoutRef.current) {
                clearTimeout(blurTimeoutRef.current);
              }

              blurTimeoutRef.current = setTimeout(() => {
                const nextFocusedInsidePicker = rootRef.current?.contains(document.activeElement) ?? false;
                if (!shouldCloseIngredientPickerAfterBlur({
                  documentHasFocus: document.hasFocus(),
                  nextFocusedInsidePicker
                })) {
                  return;
                }

                setIsOpen(false);
              }, 0);
            }}
            placeholder={inputPlaceholder}
            className={`h-10 w-full rounded-md border border-zinc-200 px-3 text-sm ${isLoadingVisible ? "pr-10" : ""}`}
            role="combobox"
            aria-expanded={isOpen}
            aria-busy={isLoadingVisible}
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
              if (
                event.key === "Backspace"
                && normalizeSearchText(query).length === 0
                && appliedQuickStartFamily
              ) {
                event.preventDefault();
                clearQuickStartFamily();
                return;
              }
              if (
                event.key === "Backspace"
                && normalizeSearchText(query).length === 0
                && appliedFavoritesOnly
              ) {
                event.preventDefault();
                clearFavoritesFilter();
                return;
              }
              if (
                event.key === "Backspace"
                && normalizeSearchText(query).length === 0
                && appliedCustomOnly
              ) {
                event.preventDefault();
                clearCustomOnlyFilter();
                return;
              }
              if (
                event.key === "Backspace"
                && normalizeSearchText(query).length === 0
                && appliedGroup
              ) {
                event.preventDefault();
                clearGroupFilter();
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
          {isLoadingVisible ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center"
            >
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
            </span>
          ) : null}
        </div>
        {quickStartPanel}
        {loadingPanel}
        {showSuggestions ? suggestionsPanel : null}
        {showEmptyState ? emptyStatePanel : null}
      </div>
    </div>
  );
};
