"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
    active
      ? "bg-zinc-950 text-white"
      : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"
  }`
);

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
  const [isPending, startTransition] = useTransition();

  const searchParamsKey = searchParams.toString();
  const state = useMemo(
    () => parseBjcpCatalogState(searchParams, catalog),
    [catalog, searchParamsKey]
  );
  const suggestionListId = "bjcp-search-suggestions";
  const [searchInput, setSearchInput] = useState(state.q);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<BjcpAdvancedFilters>(state.filters);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const deferredSearch = useDeferredValue(searchInput);
  const searchRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isSearchFocused) {
      return;
    }

    setSearchInput(state.q);
  }, [isSearchFocused, state.q]);

  useEffect(() => {
    if (!isFiltersOpen) {
      setDraftFilters(state.filters);
    }
  }, [isFiltersOpen, state.filters]);

  useEffect(() => {
    setActiveSuggestionIndex(0);
  }, [deferredSearch]);

  const currentHref = buildBjcpCatalogHref(pathname, state);

  const navigateHref = (href: string, mode: "push" | "replace" = "push") => {
    if (href === currentHref) {
      return;
    }

    startTransition(() => {
      if (mode === "replace") {
        router.replace(href, { scroll: false });
        return;
      }

      router.push(href, { scroll: false });
    });
  };

  const navigateState = (nextState: BjcpCatalogState, mode: "push" | "replace" = "push") => {
    navigateHref(buildBjcpCatalogHref(pathname, nextState), mode);
  };

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
  const quickChips = getQuickChips(catalog);
  const activePills = getActivePills(state, catalog);
  const familyCards = getFamilyCards(catalog);
  const hasAdvancedFilterSelection = Object.values(state.filters).some((values) => values.length > 0);
  const shouldDefaultFamily = (
    state.view === "families"
    && !state.q
    && !state.family
    && !state.category
    && state.chips.length === 0
    && !hasAdvancedFilterSelection
  );
  const effectiveState = shouldDefaultFamily && familyCards[0]
    ? updateState(state, { family: familyCards[0].id })
    : state;
  const effectiveFamilyId = effectiveState.family;
  const results = getBjcpCatalogResults(effectiveState, catalog);
  const visiblePills = activePills.filter((pill) => pill.type !== "scope" && pill.type !== "chip");
  const activeFilterPills = activePills.filter((pill) => pill.type === "filter");
  const hasActiveChips = state.chips.length > 0;

  useEffect(() => {
    if (!shouldShowSuggestions) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [shouldShowSuggestions]);

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

  const showBjcpAccordion = state.view === "bjcp" && !state.q && state.chips.length === 0 && !hasAdvancedFilterSelection;

  return (
    <div className="space-y-6">
      <section className="relative z-30 space-y-5 rounded-[2rem] border border-white/80 bg-white/90 p-5 shadow-[0_36px_100px_-72px_rgba(15,23,42,0.45)] backdrop-blur sm:p-6">
        <nav aria-label="Breadcrumb" className="text-sm text-zinc-500">
          <ol className="flex flex-wrap items-center gap-2">
            <li><Link href="/" className="transition hover:text-zinc-950">Главная</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-zinc-950">BJCP</li>
          </ol>
        </nav>

        <h1 className="text-3xl font-semibold text-zinc-950 sm:text-4xl" style={{ fontFamily: "var(--font-display)" }}>
          Справочник BJCP
        </h1>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div ref={searchRef} className="relative z-[70]">
            <label className="sr-only" htmlFor="bjcp-search">Поиск стилей BJCP</label>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
            <input
              id="bjcp-search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              autoComplete="off"
              placeholder="Код BJCP, русское или английское название, синоним"
              className="h-[3.25rem] w-full rounded-[1.4rem] border border-zinc-200 bg-white px-12 pr-12 text-base text-zinc-950 outline-none transition focus:border-zinc-400 focus:ring-4 focus:ring-zinc-200/70"
              role="combobox"
              aria-expanded={shouldShowSuggestions}
              aria-autocomplete="list"
              aria-controls={shouldShowSuggestions ? suggestionListId : undefined}
              aria-activedescendant={shouldShowSuggestions ? `bjcp-suggestion-${flatSuggestions[activeSuggestionIndex]?.kind ?? "style"}-${flatSuggestions[activeSuggestionIndex]?.id ?? "0"}` : undefined}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setIsSearchFocused(false);
                  return;
                }

                if (!shouldShowSuggestions) {
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
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-950"
                aria-label="Очистить поиск"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}

            {shouldShowSuggestions ? (
              <div
                id={suggestionListId}
                role="listbox"
                className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-[80] overflow-hidden rounded-[1.5rem] border border-zinc-200 bg-white shadow-2xl"
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
                    <section key={label} className="border-b border-zinc-100 last:border-b-0">
                      <div className="bg-zinc-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
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
                            aria-selected={flatIndex === activeSuggestionIndex}
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => handleSuggestionSelect(item)}
                            className={`flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition hover:bg-zinc-50 ${
                              flatIndex === activeSuggestionIndex ? "bg-zinc-50" : "bg-white"
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-zinc-950">{item.label}</p>
                              <p className="mt-1 truncate text-xs text-zinc-500">{item.subtitle}</p>
                            </div>
                            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300" />
                          </button>
                        );
                      })}
                    </section>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:justify-end">
            <div className="flex flex-wrap gap-2 rounded-full bg-zinc-100 p-1">
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
                onClick={() => navigateState(updateState(state, { view: "bjcp", family: null }))}
                className={segmentedButtonClassName(state.view === "bjcp")}
              >
                <List className="h-4 w-4" />
                Категории BJCP
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsFiltersOpen(true)}
              className={`inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition ${
                activeFilterPills.length
                  ? "border-zinc-950 bg-zinc-950 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
              }`}
            >
              <Filter className="h-4 w-4" />
              Фильтры
              {activeFilterPills.length ? (
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px]">
                  {activeFilterPills.length}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {quickChips.map((chip: BjcpQuickChip) => {
            const active = state.chips.includes(chip.id);

            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => navigateState(updateState(state, {
                  ...resetCatalogControls(),
                  chips: active ? [] : [chip.id]
                }))}
                className={`rounded-full border px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "border-zinc-950 bg-zinc-950 text-white"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
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
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50"
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
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Сбросить всё
            </button>
          ) : null}
        </div>

        {visiblePills.length ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-4">
            {visiblePills.map((pill) => (
              <button
                key={pill.key}
                type="button"
                onClick={() => handleRemovePill(pill.key, pill.group, pill.value)}
                className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-white"
              >
                {pill.label}
                <X className="h-3.5 w-3.5 text-zinc-400" />
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {state.view === "families" ? (
        <section className="relative z-0 grid gap-6 xl:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
          <aside className="rounded-[2rem] border border-zinc-200 bg-white p-3 shadow-sm xl:sticky xl:top-24 xl:self-start">
            <div className="px-2 pb-2">
              <h2 className="text-sm font-semibold text-zinc-950">Семейства</h2>
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
                    className={`flex w-full items-center justify-between gap-3 rounded-[1.25rem] border px-4 py-3 text-left transition ${
                      active
                        ? "border-zinc-950 bg-zinc-950 text-white"
                        : "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-300 hover:bg-zinc-50"
                    }`}
                  >
                    <span className="text-sm font-medium leading-6">{family.nameRu}</span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      active ? "bg-white/10 text-white" : "bg-slate-50 text-zinc-700 ring-1 ring-zinc-200"
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
              <h2 className="text-2xl font-semibold text-zinc-950" style={{ fontFamily: "var(--font-display)" }}>
                {results.title}
              </h2>

              <span className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700">
                {results.styles.length} стилей
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
        <section className="relative z-0 space-y-4">
          <h2 className="text-2xl font-semibold text-zinc-950" style={{ fontFamily: "var(--font-display)" }}>
            Категории BJCP
          </h2>

          <div className="space-y-3">
            {catalog.categories.map((category: BjcpCatalogData["categories"][number]) => {
              const open = state.category === category.id;
              const categoryStyles = open ? getCategoryPreviewStyles(catalog, category.id) : [];

              return (
                <section key={category.id} className="overflow-hidden rounded-[1.5rem] border border-zinc-200 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => navigateState(updateState(state, {
                      ...resetCatalogControls(),
                      category: open ? null : category.id,
                      view: "bjcp",
                      sort: "code"
                    }))}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-zinc-50"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Категория {category.id}</p>
                      <h3 className="mt-1 text-xl font-semibold text-zinc-950">{category.nameRu}</h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200">
                        {category.articleCount}
                      </span>
                      {open ? <ChevronDown className="h-5 w-5 text-zinc-400" /> : <ChevronRight className="h-5 w-5 text-zinc-400" />}
                    </div>
                  </button>

                  {open ? (
                    <div className="border-t border-zinc-200 px-5 py-4">
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {categoryStyles.map((style: BjcpCatalogStyle) => (
                          <Link
                            key={style.slug}
                            href={`/bjcp/${style.slug}`}
                            className="rounded-xl border border-zinc-200 bg-slate-50 px-3 py-3 text-sm text-zinc-700 transition hover:border-zinc-300 hover:bg-white hover:text-zinc-950"
                          >
                            <span className="font-semibold text-zinc-950">{style.bjcpId}</span>
                            <span className="mx-2 text-zinc-300">·</span>
                            {style.title}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </section>
      ) : null}

      {state.view === "bjcp" && results.showResults && !showBjcpAccordion ? (
        <section id="bjcp-results" className="relative z-0 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-2xl font-semibold text-zinc-950" style={{ fontFamily: "var(--font-display)" }}>
              {results.title}
            </h2>

            <span className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700">
              {results.styles.length} стилей
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
