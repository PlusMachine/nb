"use client";

import React, { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Filter,
  LayoutGrid,
  List,
  RotateCcw,
  Search,
  X
} from "lucide-react";
import type { BjcpCatalogData, BjcpCatalogStyle } from "@nb/content";
import { AnchoredPopover } from "@nb/ui";

import {
  getBjcpCardColorInfo,
  getBjcpCardStatDisplay
} from "@/features/content/bjcp-card-stats";
import {
  buildBjcpCatalogHref,
  getActivePills,
  getBjcpCatalogResults,
  getBjcpSearchSuggestions,
  getCategoryPreviewStyles,
  getFamilyCards,
  getQuickChips,
  hasActiveBjcpCatalogControls,
  parseBjcpCatalogState,
  removeFilterValue,
  toggleFilterValue,
  type BjcpAdvancedFilters,
  type BjcpCatalogState,
  type BjcpFilterGroup,
  type BjcpQuickChip,
  type BjcpFilterOptionId,
  type BjcpSuggestion
} from "@/features/content/bjcp-catalog";

import { BjcpEmptyState } from "./bjcp-empty-state";
import { BjcpFilterSheet } from "./bjcp-filter-sheet";
import { BjcpStyleCard } from "./bjcp-style-card";

type Props = {
  catalog: BjcpCatalogData;
};

const searchDebounceMs = 220;
const emptyFilters = (): BjcpAdvancedFilters => ({
  color: [],
  fermentation: [],
  strength: [],
  region: [],
  character: []
});

const segmentedButtonClassName = (active: boolean) => (
  `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${active
    ? "bg-foreground text-background"
    : "bg-card text-muted-foreground ring-1 ring-border hover:bg-accent"
  }`
);

const numericCategoryIdPattern = /^\d+$/;

const getNumericCategoryValue = (categoryId: string) => {
  if (!numericCategoryIdPattern.test(categoryId)) {
    return null;
  }

  const value = Number.parseInt(categoryId, 10);
  return Number.isFinite(value) ? value : null;
};

const formatStyleCountLabel = (count: number) => {
  const remainder10 = count % 10;
  const remainder100 = count % 100;

  if (remainder10 === 1 && remainder100 !== 11) {
    return `${count} стиль`;
  }

  if (remainder10 >= 2 && remainder10 <= 4 && (remainder100 < 12 || remainder100 > 14)) {
    return `${count} стиля`;
  }

  return `${count} стилей`;
};

function CategoryStyleDetailCard({ style }: { style: BjcpCatalogStyle }) {
  const abvStat = getBjcpCardStatDisplay(style, "abv");
  const ibuStat = getBjcpCardStatDisplay(style, "ibu");
  const colorInfo = getBjcpCardColorInfo(style);

  return (
    <Link
      href={`/bjcp/${style.slug}`}
      className="group block overflow-hidden rounded-[1rem] border border-border bg-card shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] transition duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-[0_18px_36px_-24px_rgba(15,23,42,0.28)]"
      aria-label={`Открыть стиль ${style.bjcpId} ${style.title}`}
    >
      <article className="flex h-full">
        <div
          className="w-1.5 shrink-0 self-stretch"
          style={{ background: `linear-gradient(180deg, ${colorInfo.startHex} 0%, ${colorInfo.endHex} 100%)` }}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-2 text-[13px] leading-tight">
            <div className="min-w-0 flex items-baseline gap-2">
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {style.bjcpId}
              </span>
              <h4 className="truncate font-medium text-foreground">
                {style.title}
              </h4>
            </div>

            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-muted-foreground" />
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-muted-foreground">
            <span>ABV <span className={abvStat.isFallback ? "text-foreground" : "text-foreground"}>{abvStat.value}</span></span>
            <span className="text-muted-foreground">·</span>
            <span>IBU <span className={ibuStat.isFallback ? "text-foreground" : "text-foreground"}>{ibuStat.value}</span></span>
            <span className="text-muted-foreground">·</span>
            <span>SRM <span className={colorInfo.isFallback ? "text-foreground" : "text-foreground"}>{colorInfo.value}</span></span>
          </div>
        </div>
      </article>
    </Link>
  );
}

function AccordionSectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-2 pt-4 pb-1" aria-hidden="true">
      <span className="text-xs font-normal tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <div className="h-px flex-1 bg-border/80" />
    </div>
  );
}

const updateState = (state: BjcpCatalogState, patch: Partial<BjcpCatalogState>): BjcpCatalogState => ({
  ...state,
  ...patch
});

const flattenSuggestions = (sections: ReturnType<typeof getBjcpSearchSuggestions>) => [
  ...sections.styles,
  ...sections.families,
  ...sections.categories
];

export function BjcpCatalog({ catalog }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const searchParamsKey = searchParams.toString();
  const state = useMemo(
    () => parseBjcpCatalogState(searchParams, catalog),
    [catalog, searchParamsKey]
  );
  const suggestionListId = "bjcp-search-suggestions";
  const [searchInput, setSearchInput] = useState(state.q);
  const [isSearchReady, setIsSearchReady] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<BjcpAdvancedFilters>(state.filters);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const deferredSearch = useDeferredValue(searchInput);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const previousQueryRef = useRef(state.q);

  useEffect(() => {
    // SSR уже показывает поле, но до гидратации ранний ввод может потеряться.
    // Разрешаем ввод, когда React подключил обработчики этого компонента.
    setIsSearchReady(true);
  }, []);

  useEffect(() => {
    const previousQuery = previousQueryRef.current;
    previousQueryRef.current = state.q;
    // Смена фокуса не отменяет ввод, ожидающий debounce. При навигации
    // синхронизируем URL только с полем, в котором нет более свежего запроса.
    setSearchInput((current) => current.trim() === previousQuery ? state.q : current);
  }, [state.q]);

  useEffect(() => {
    const restoreSearch = () => {
      // Назад/вперёд отменяет ещё не применённый ввод, иначе debounce мог бы
      // переписать только что восстановленную запись истории старым черновиком.
      setSearchInput(new URL(window.location.href).searchParams.get("q") ?? "");
      setIsSearchFocused(false);
    };
    window.addEventListener("popstate", restoreSearch);
    return () => window.removeEventListener("popstate", restoreSearch);
  }, []);

  useEffect(() => {
    if (!isFiltersOpen) {
      setDraftFilters(state.filters);
    }
  }, [isFiltersOpen, state.filters]);

  useEffect(() => {
    setActiveSuggestionIndex(0);
  }, [deferredSearch]);

  const navigateHref = useCallback((href: string, mode: "push" | "replace" = "push") => {
    if (href === `${window.location.pathname}${window.location.search}`) {
      return;
    }

    // Весь каталог уже загружен в props. Меняем только клиентские фильтры:
    // History API обновляет useSearchParams без RSC-запроса и поздних ответов,
    // которые могли возвращать старый запрос после нового ввода или очистки.
    if (mode === "replace") {
      window.history.replaceState(null, "", href);
    } else {
      window.history.pushState(null, "", href);
    }
  }, []);

  const navigateState = useCallback((nextState: BjcpCatalogState, mode: "push" | "replace" = "push") => {
    navigateHref(buildBjcpCatalogHref(pathname, nextState), mode);
  }, [navigateHref, pathname]);

  useEffect(() => {
    const trimmedInput = searchInput.trim();
    const trimmedState = state.q.trim();
    if (trimmedInput === trimmedState) {
      return;
    }

    const timer = window.setTimeout(() => {
      navigateState(updateState(state, {
        q: trimmedInput,
        sort: trimmedInput ? "relevance" : "code"
      }), "replace");
    }, searchDebounceMs);

    return () => window.clearTimeout(timer);
  }, [navigateState, searchInput, state]);

  const suggestions = getBjcpSearchSuggestions(deferredSearch, catalog);
  const flatSuggestions = flattenSuggestions(suggestions);
  const shouldShowSuggestions = isSearchFocused && flatSuggestions.length > 0 && deferredSearch.trim().length >= 2;
  const activeSuggestion = flatSuggestions[activeSuggestionIndex];
  const activeSuggestionId = activeSuggestion ? `bjcp-suggestion-${activeSuggestion.kind}-${activeSuggestion.id}` : null;

  useEffect(() => {
    if (!shouldShowSuggestions || !activeSuggestionId) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(activeSuggestionId)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeSuggestionId, shouldShowSuggestions]);
  const quickChips = getQuickChips(catalog);
  const displayState = state.view === "bjcp" && state.chips.length
    ? updateState(state, { chips: [] })
    : state;
  const activePills = getActivePills(displayState, catalog);
  const familyCards = getFamilyCards(catalog);
  const hasAdvancedFilterSelection = Object.values(displayState.filters).some((values) => values.length > 0);
  const shouldDefaultFamily = (
    displayState.view === "families"
    && !displayState.q
    && !displayState.family
    && !displayState.category
    && displayState.chips.length === 0
    && !hasAdvancedFilterSelection
  );
  const effectiveState = shouldDefaultFamily && familyCards[0]
    ? updateState(displayState, { family: familyCards[0].id })
    : displayState;
  const effectiveFamilyId = effectiveState.family;
  const results = getBjcpCatalogResults(effectiveState, catalog);
  const visiblePills = activePills.filter((pill) => pill.type !== "scope" && pill.type !== "chip");
  const activeFilterPills = activePills.filter((pill) => pill.type === "filter");
  const hasActiveChips = displayState.chips.length > 0;
  const numericJumpBarCategories = catalog.categories.filter((category) => numericCategoryIdPattern.test(category.id));
  const extraJumpBarCategories = catalog.categories.filter((category) => !numericCategoryIdPattern.test(category.id));
  const jumpBarGroups = [
    { key: "jump-1-8", label: "1–8", min: 1, max: 8 },
    { key: "jump-9-17", label: "9–17", min: 9, max: 17 },
    { key: "jump-18-26", label: "18–26", min: 18, max: 26 },
    { key: "jump-27-34", label: "27–34", min: 27, max: 34 }
  ]
    .map((group) => {
      const categoryIds = numericJumpBarCategories
        .filter((category) => {
          const numericId = getNumericCategoryValue(category.id);
          return numericId !== null && numericId >= group.min && numericId <= group.max;
        })
        .map((category) => category.id);

      return {
        key: group.key,
        label: group.label,
        targetId: categoryIds[0] ?? null,
        categoryIds
      };
    })
    .filter((group) => group.categoryIds.length > 0);

  if (extraJumpBarCategories.length) {
    jumpBarGroups.push({
      key: "jump-locals",
      label: "X-* Локальные",
      targetId: extraJumpBarCategories[0]?.id ?? null,
      categoryIds: extraJumpBarCategories.map((category) => category.id)
    });
  }

  const firstHistoricalSpecialCategoryId = catalog.categories.find((category) => category.id === "27")?.id ?? null;
  const firstLocalCategoryId = extraJumpBarCategories[0]?.id ?? null;

  useEffect(() => {
    if (state.view !== "bjcp" || state.chips.length === 0) {
      return;
    }

    navigateState(updateState(state, { chips: [] }), "replace");
  }, [navigateState, state]);

  const handleSuggestionSelect = (suggestion: BjcpSuggestion) => {
    setIsSearchFocused(false);

    const suggestionHref = suggestion.href;

    if (suggestion.kind === "style" && suggestionHref) {
      startTransition(() => {
        router.push(suggestionHref);
      });
      return;
    }

    if (suggestion.kind === "family" && suggestion.familyId) {
      setSearchInput("");
      navigateState({
        ...resetCatalogControls(false),
        view: "families",
        family: suggestion.familyId,
        sort: "code"
      });
      return;
    }

    if (suggestion.kind === "category" && suggestion.categoryId) {
      setSearchInput("");
      navigateState({
        ...resetCatalogControls(false),
        view: "bjcp",
        category: suggestion.categoryId,
        sort: "code"
      });
    }
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setIsSearchFocused(false);
    navigateState(updateState(state, {
      q: "",
      sort: "code"
    }), "replace");
  };

  const resetCatalogControls = (keepQuery = true) => ({
    q: keepQuery ? state.q : "",
    family: null,
    category: null,
    chips: [],
    filters: emptyFilters(),
    sort: keepQuery && state.q ? "relevance" as const : "code" as const
  });

  const handleRemovePill = (key: string, group?: BjcpFilterGroup, value?: BjcpFilterOptionId | string) => {
    if (key.startsWith("chip:") && value) {
      navigateState(updateState(state, {
        chips: state.chips.filter((candidate) => candidate !== value)
      }));
      return;
    }

    if (key.startsWith("filter:") && group && value) {
      navigateState(updateState(state, {
        filters: removeFilterValue(state.filters, group, value as BjcpFilterOptionId)
      }));
      return;
    }

    if (key.startsWith("family:")) {
      navigateState(updateState(state, {
        family: null
      }));
      return;
    }

    if (key.startsWith("category:")) {
      navigateState(updateState(state, {
        category: null
      }));
    }
  };

  const handleJumpToCategory = (categoryId: string | null) => {
    if (!categoryId) {
      return;
    }

    document.getElementById(`bjcp-category-${categoryId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  };

  const showBjcpAccordion = displayState.view === "bjcp" && !displayState.q && !hasAdvancedFilterSelection;

  return (
    <div className="space-y-6">
      <section className="relative z-30 space-y-5 rounded-[2rem] border border-card/80 bg-card/90 p-5 shadow-[0_36px_100px_-72px_rgba(15,23,42,0.45)] backdrop-blur sm:p-6">
        <nav aria-label="Навигационная цепочка" className="text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-2">
            <li><Link href="/" className="transition hover:text-foreground">Главная</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-foreground">Стили пива по BJCP</li>
          </ol>
        </nav>

        <h1 className="text-3xl font-semibold text-foreground sm:text-4xl" style={{ fontFamily: "var(--font-display)" }}>
          Стили пива по BJCP
        </h1>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <AnchoredPopover
            open={shouldShowSuggestions}
            onOpenChange={setIsSearchFocused}
            id={suggestionListId}
            role="listbox"
            aria-label="Подсказки BJCP"
            align="start"
            side="bottom"
            sideOffset={8}
            hideWhenDetached
            collisionPadding={{ top: 64, bottom: 8, left: 8, right: 8 }}
            onInteractOutside={event => {
              if (searchRef.current?.contains(event.target as Node)) event.preventDefault();
            }}
            className="z-[80] max-h-[min(20rem,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-[1.5rem] border border-border bg-card shadow-2xl outline-none"
            anchor={<div ref={searchRef} className="relative z-[70]">
            <label className="sr-only" htmlFor="bjcp-search">Поиск стилей BJCP</label>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              id="bjcp-search"
              value={searchInput}
              disabled={!isSearchReady}
              aria-busy={!isSearchReady}
              onChange={(event) => {
                setSearchInput(event.target.value);
                setIsSearchFocused(true);
              }}
              onFocus={() => setIsSearchFocused(true)}
              autoComplete="off"
              placeholder="Код BJCP, русское или английское название, синоним"
              className="h-[3.25rem] w-full rounded-[1.4rem] border border-border bg-card px-12 pr-12 text-base text-foreground outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/70 disabled:cursor-wait disabled:opacity-60"
              role="combobox"
              aria-expanded={shouldShowSuggestions}
              aria-autocomplete="list"
              aria-controls={shouldShowSuggestions ? suggestionListId : undefined}
              aria-activedescendant={shouldShowSuggestions ? activeSuggestionId ?? undefined : undefined}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setIsSearchFocused(false);
                  return;
                }

                if (!shouldShowSuggestions) {
                  if ((event.key === "ArrowDown" || event.key === "ArrowUp") && flatSuggestions.length && deferredSearch.trim().length >= 2) {
                    event.preventDefault();
                    setIsSearchFocused(true);
                    setActiveSuggestionIndex(event.key === "ArrowUp" ? flatSuggestions.length - 1 : 0);
                  }
                  return;
                }

                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveSuggestionIndex((index) => Math.min(index + 1, flatSuggestions.length - 1));
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveSuggestionIndex((index) => Math.max(index - 1, 0));
                }

                if (event.key === "Enter") {
                  event.preventDefault();
                  const suggestion = flatSuggestions[activeSuggestionIndex];
                  if (suggestion) {
                    handleSuggestionSelect(suggestion);
                  }
                }
              }}
            />
            {searchInput ? (
              <button
                type="button"
                onMouseDown={event => event.preventDefault()}
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground"
                aria-label="Очистить поиск"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}

            </div>}
          >
                {([
                  ["Стили", suggestions.styles],
                  ["Семейства", suggestions.families],
                  ["Категории BJCP", suggestions.categories]
                ] as const).map(([label, items]) => {
                  if (!items.length) {
                    return null;
                  }

                  return (
                    <section key={label} className="border-b border-border last:border-b-0">
                      <div className="bg-muted px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {label}
                      </div>
                      {items.map((item) => {
                        const flatIndex = flatSuggestions.findIndex((candidate) => candidate.id === item.id && candidate.kind === item.kind);

                        return (
                          <button
                            key={`${item.kind}:${item.id}`}
                            id={`bjcp-suggestion-${item.kind}-${item.id}`}
                            type="button"
                            role="option"
                            tabIndex={-1}
                            aria-selected={flatIndex === activeSuggestionIndex}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleSuggestionSelect(item)}
                            className={`flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition hover:bg-accent ${flatIndex === activeSuggestionIndex ? "bg-accent" : "bg-card"
                              }`}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">{item.label}</p>
                              <p className="mt-1 truncate text-xs text-muted-foreground">{item.subtitle}</p>
                            </div>
                            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          </button>
                        );
                      })}
                    </section>
                  );
                })}
          </AnchoredPopover>

          <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:justify-end">
            <div className="flex flex-wrap gap-2 rounded-full bg-muted p-1">
              <button
                type="button"
                onClick={() => navigateState(updateState(state, { view: "families", category: null }))}
                className={segmentedButtonClassName(state.view === "families")}
              >
                <LayoutGrid className="h-4 w-4" />
                Семейства
              </button>
              <button
                type="button"
                onClick={() => navigateState(updateState(state, { view: "bjcp", family: null, chips: [] }))}
                className={segmentedButtonClassName(state.view === "bjcp")}
              >
                <List className="h-4 w-4" />
                Категории BJCP
              </button>
            </div>

            {state.view === "families" ? (
              <button
                type="button"
                onClick={() => setIsFiltersOpen(true)}
                className={`inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition ${activeFilterPills.length
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-foreground hover:border-border hover:bg-accent"
                  }`}
              >
                <Filter className="h-4 w-4" />
                Фильтры
                {activeFilterPills.length ? (
                  <span className="rounded-full bg-background/15 px-2 py-0.5 text-[11px]">
                    {activeFilterPills.length}
                  </span>
                ) : null}
              </button>
            ) : null}
          </div>
        </div>

        {state.view === "families" ? (
          <div className="flex flex-wrap items-center gap-2">
            {quickChips.map((chip: BjcpQuickChip) => {
              const active = displayState.chips.includes(chip.id);

              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => navigateState(updateState(state, {
                    ...resetCatalogControls(),
                    chips: active ? [] : [chip.id]
                  }))}
                  className={`rounded-full border px-3 py-2 text-sm font-medium transition ${active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-foreground hover:border-border hover:bg-accent"
                    }`}
                >
                  {chip.label}
                </button>
              );
            })}

            {activeFilterPills.length ? (
              <button
                type="button"
                onClick={() => navigateState(updateState(state, { filters: emptyFilters() }))}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition hover:border-border hover:bg-accent"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Сбросить фильтры
              </button>
            ) : null}

            {hasActiveChips ? (
              <button
                type="button"
                onClick={() => navigateState(updateState(state, {
                  ...resetCatalogControls(false)
                }))}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition hover:border-border hover:bg-accent"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Сбросить всё
              </button>
            ) : null}
          </div>
        ) : null}

        {showBjcpAccordion ? (
          <div className="flex flex-wrap items-center gap-3">
            {jumpBarGroups.map((group) => {
              const active = group.categoryIds.includes(state.category ?? "");

              return (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => handleJumpToCategory(group.targetId)}
                  className={`rounded-full border px-3.5 py-2 text-xs font-semibold tracking-[0.04em] transition ${active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-muted text-foreground hover:border-border hover:bg-card"
                    }`}
                >
                  {group.label}
                </button>
              );
            })}
          </div>
        ) : null}

        {visiblePills.length ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            {visiblePills.map((pill) => (
              <button
                key={pill.key}
                type="button"
                onClick={() => handleRemovePill(pill.key, pill.group, pill.value)}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground transition hover:border-border hover:bg-card"
              >
                {pill.label}
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {state.view === "families" ? (
        <section className="relative z-0 grid gap-6 xl:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
          <aside className="rounded-[2rem] border border-border bg-card p-3 shadow-sm xl:sticky xl:top-24 xl:self-start">
            <div className="px-2 pb-2">
              <h2 className="text-sm font-semibold text-foreground">Семейства</h2>
            </div>

            <div className="space-y-2">
              {familyCards.map((family: ReturnType<typeof getFamilyCards>[number]) => {
                const active = effectiveFamilyId === family.id;
                const explicitlySelected = state.family === family.id;

                return (
                  <button
                    key={family.id}
                    type="button"
                    onClick={() => navigateState(updateState(state, {
                      ...resetCatalogControls(),
                      family: explicitlySelected ? null : family.id,
                      view: "families",
                      sort: "code"
                    }))}
                    className={`flex w-full items-center justify-between gap-3 rounded-[1.25rem] border px-4 py-3 text-left transition ${active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-foreground hover:border-border hover:bg-accent"
                      }`}
                  >
                    <span className="text-sm font-medium leading-6">{family.nameRu}</span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-background/10 text-background" : "bg-muted text-foreground ring-1 ring-border"
                      }`}>
                      {family.styleCount}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section id="bjcp-results" className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <h2 className="text-2xl font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                {results.title}
              </h2>

              <span className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground">
                {formatStyleCountLabel(results.styles.length)}
              </span>
            </div>

            {results.styles.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {results.styles.map((style) => (
                  <BjcpStyleCard key={style.slug} style={style} />
                ))}
              </div>
            ) : (
              <BjcpEmptyState
                query={state.q}
                hasFilters={hasActiveBjcpCatalogControls(state)}
                onReset={() => navigateState(updateState(state, { ...resetCatalogControls(false) }))}
              />
            )}
          </section>
        </section>
      ) : null}

      {showBjcpAccordion ? (
        <section className="relative z-0 space-y-3">
          {catalog.categories.map((category: BjcpCatalogData["categories"][number]) => {
            const open = state.category === category.id;
            // Считаем и рендерим стили ВСЕХ категорий (не только раскрытой) — иначе
            // ссылки на стили свёрнутых категорий не попадают в серверный HTML
            // (см. A8). Свёрнутые секции прячем через CSS (`hidden`), а не через
            // условный рендер — краулер видит все ~120 ссылок, пользователь только
            // раскрытую категорию.
            const categoryStyles = getCategoryPreviewStyles(catalog, category.id);
            const dividerLabel = category.id === firstHistoricalSpecialCategoryId
              ? "Исторические и специальные"
              : category.id === firstLocalCategoryId
                ? "Локальные"
                : null;

            return (
              <Fragment key={category.id}>
                {dividerLabel ? <AccordionSectionDivider label={dividerLabel} /> : null}

                <section
                  id={`bjcp-category-${category.id}`}
                  className={`overflow-hidden rounded-[1.5rem] border transition ${open
                    ? "border-border bg-[linear-gradient(180deg,rgba(250,250,250,0.98),rgba(244,244,245,0.98))] shadow-[0_26px_70px_-54px_rgba(15,23,42,0.35)]"
                    : "border-border bg-card shadow-sm"
                    } scroll-mt-28`}
                >
                  <button
                    type="button"
                    onClick={() => navigateState(updateState(state, {
                      ...resetCatalogControls(),
                      category: open ? null : category.id,
                      view: "bjcp",
                      sort: "code"
                    }))}
                    className={`flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition ${open ? "hover:bg-card/30" : "hover:bg-accent"}`}
                  >
                    <div className="min-w-0 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className={`text-sm font-medium ${open ? "text-foreground" : "text-muted-foreground"}`}>
                        {category.id}
                      </span>
                      <h3 className="text-lg font-medium text-foreground">{category.nameRu}</h3>
                    </div>

                    <div className="flex items-center gap-3 pl-3">
                      <span className="text-sm text-muted-foreground">
                        {category.styleCodeRange ?? category.id}
                      </span>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${open
                        ? "bg-foreground text-background"
                        : "bg-muted text-foreground ring-1 ring-border"
                        }`}>
                        {formatStyleCountLabel(category.articleCount)}
                      </span>
                      {open ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                    </div>
                  </button>

                  <div className={`border-t border-border/70 px-5 py-4 ${open ? "" : "hidden"}`}>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {categoryStyles.map((style: BjcpCatalogStyle) => (
                        <CategoryStyleDetailCard key={style.slug} style={style} />
                      ))}
                    </div>
                  </div>
                </section>
              </Fragment>
            );
          })}
        </section>
      ) : null}

      {state.view === "bjcp" && results.showResults && !showBjcpAccordion ? (
        <section id="bjcp-results" className="relative z-0 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-2xl font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
              {results.title}
            </h2>

            <span className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground">
              {formatStyleCountLabel(results.styles.length)}
            </span>
          </div>

          {results.styles.length ? (
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {results.styles.map((style) => (
                <BjcpStyleCard key={style.slug} style={style} />
              ))}
            </div>
          ) : (
            <BjcpEmptyState
              query={state.q}
              hasFilters={hasActiveBjcpCatalogControls(state)}
              onReset={() => navigateState(updateState(state, { ...resetCatalogControls(false) }))}
            />
          )}
        </section>
      ) : null}

      <BjcpFilterSheet
        open={isFiltersOpen}
        filters={draftFilters}
        onToggle={(group, value) => setDraftFilters((current) => toggleFilterValue(current, group, value))}
        onReset={() => setDraftFilters(emptyFilters())}
        onApply={() => {
          navigateState(updateState(state, {
            ...resetCatalogControls(),
            filters: draftFilters
          }));
          setIsFiltersOpen(false);
        }}
        onClose={() => setIsFiltersOpen(false)}
      />
    </div>
  );
}
