"use client";

import React, { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { SystemCurrency, SystemCurrencyRateMap } from "@/features/system/currency";
import { buildInventoryToolbarHref, hasActiveInventoryFilters, resolveInventoryShowFinished } from "@/features/inventory/page-model";
import { inventoryFiltersHref, parseInventoryFilters, restoreInventoryViewDates, type InventoryViewData, type InventoryViewResponse } from "@/features/inventory/query";
import { BrewableRecipesSection } from "@/components/recipes/brewable-recipes-section";
import { GroupedInventoryList } from "./grouped-inventory-list";
import { InventoryTabs } from "./inventory-tabs";
import { InventoryEmptyState } from "./inventory-empty-state";
import { InventoryToolbar } from "./inventory-toolbar";
import { AddIngredientTrigger } from "./add-ingredient-trigger";

type Props = {
  initial: InventoryViewData;
  preferredCurrency: SystemCurrency;
  currencyRates: SystemCurrencyRateMap;
  missingCount: number;
  addIngredientProps: ComponentProps<typeof AddIngredientTrigger>;
};

export function InventoryPageClient({ initial, preferredCurrency, currencyRates, missingCount, addIngredientProps }: Props) {
  const searchParams = useSearchParams();
  const filters = searchParams ? parseInventoryFilters(Object.fromEntries(searchParams)) : initial.filters;
  const queryKey = inventoryFiltersHref(filters);
  const [view, setView] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const mountedRef = useRef(false);
  const initialRef = useRef(initial);
  const sequenceRef = useRef(0);
  const navigate = useCallback((href: string) => window.history.replaceState(null, "", href), []);

  useEffect(() => {
    const first = !mountedRef.current;
    mountedRef.current = true;
    const serverChanged = initialRef.current !== initial;
    initialRef.current = initial;
    if (first && queryKey === initial.key) return;
    const sequence = ++sequenceRef.current;
    const controller = new AbortController();
    if (serverChanged && initial.key === queryKey) setView(initial);
    setLoading(true);
    setError(false);
    fetch(queryKey.replace("/app/ingredients", "/api/inventory"), { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("INVENTORY_FETCH_FAILED");
        return restoreInventoryViewDates(await response.json() as InventoryViewResponse);
      })
      .then(result => {
        if (!controller.signal.aborted && sequence === sequenceRef.current) setView(result);
      })
      .catch(() => {
        if (!controller.signal.aborted && sequence === sequenceRef.current) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted && sequence === sequenceRef.current) setLoading(false);
      });
    return () => controller.abort();
  }, [queryKey, initial, retry]);

  const { items, summary, searchRescue } = view;
  const { search: rawSearch, category, subtype, group, sort } = filters;
  const showFinished = resolveInventoryShowFinished(filters.showFinished, summary);
  const hasAnyItems = summary.totalItems > 0;
  const isNarrowedView = Boolean(rawSearch || category || subtype || group);
  const brewableRecipes = isNarrowedView ? [] : view.brewableRecipes;
  const updating = loading || (!error && view.key !== queryKey);
  const hasFilters = hasActiveInventoryFilters({
    search: rawSearch,
    category: category ?? "all",
    subtype: subtype ?? null,
    group: group ?? null,
    showFinished,
    sort
  });
  const finishedHref = buildInventoryToolbarHref("/app/ingredients", {
    search: rawSearch,
    category: category ?? "all",
    subtype: subtype ?? null,
    group: group ?? null,
    showFinished: true,
    sort
  });

  const inventoryList = items.length === 0 ? (
    <InventoryEmptyState
      hasAnyItems={hasAnyItems}
      hasFilters={hasFilters}
      search={rawSearch}
      category={category}
      subtype={subtype ?? null}
      group={group ?? null}
      showFinished={showFinished}
    />
  ) : (
    <div className="space-y-3">
      {searchRescue === "layout" ? (
        <p className="text-sm text-muted-foreground">Возможно, вы имели в виду:</p>
      ) : null}
      <GroupedInventoryList
        items={items}
        preferredCurrency={preferredCurrency}
        currencyRates={currencyRates}
        layout={sort === "price" || sort === "best_before" ? "flat" : "grouped"}
        sortEmphasis={sort === "price" ? "price" : sort === "best_before" ? "best_before" : null}
      />
    </div>
  );

  // «Можно сварить» — главный мотиватор страницы. На десктопе выносим в правый
  // sticky-rail (виден без скролла, заполняет пустое место рядом с узкими
  // карточками); на мобиле секция стекается под список (+ якорь в шапке). Без
  // подходящих рецептов rail не занимает место — список во всю ширину.
  const inventoryBody = brewableRecipes.length > 0 ? (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="min-w-0">{inventoryList}</div>
      <aside className="lg:sticky lg:top-4">
        <BrewableRecipesSection recipes={brewableRecipes} />
      </aside>
    </div>
  ) : (
    inventoryList
  );

  return (
    <main className="space-y-5">
      <section className="flex items-start justify-between gap-3 sm:items-center">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Мой склад</h1>
          {hasAnyItems ? (
            <p className="text-sm text-muted-foreground">
              {summary.inStockItems} в наличии
              {summary.emptyItems > 0 ? (
                showFinished ? (
                  <> · {summary.emptyItems} закончились</>
                ) : (
                  <>
                    {" · "}
                    <Link
                      href={finishedHref}
                      className="underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                    >
                      {summary.emptyItems} закончились
                    </Link>
                  </>
                )
              ) : null}
              {/* На мобиле секция «Можно сварить» уходит в самый низ — даём якорь
                  прямо в шапке. На десктопе она в правом rail, якорь не нужен. */}
              {brewableRecipes.length > 0 ? (
                <span className="lg:hidden">
                  {" · "}
                  <a
                    href="#brewable"
                    className="underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                  >
                    рецепты: {brewableRecipes.length}
                  </a>
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AddIngredientTrigger {...addIngredientProps}
            initialCategory={addIngredientProps.initialCategory ?? category ?? null}
            initialSubtype={addIngredientProps.initialSubtype ?? subtype ?? null}
            initialGroup={group ?? null}
          />
        </div>
      </section>

      <InventoryTabs active="stock" missingCount={missingCount} />

      <InventoryToolbar
        search={rawSearch}
        category={category ?? "all"}
        subtype={subtype ?? null}
        group={group ?? null}
        showFinished={showFinished}
        sort={sort}
        summary={summary}
        visibleItemCount={items.length}
        onNavigate={navigate}
        resultsPending={updating}
      />

      {error ? <div role="alert" className="rounded-xl border border-border bg-card p-3 text-sm">
        Не удалось обновить список. Проверьте соединение и повторите.
        <button type="button" className="ml-2 min-h-11 underline" onClick={() => setRetry(value => value + 1)}>Повторить</button>
      </div> : null}
      <div aria-busy={updating} className={updating ? "opacity-60" : undefined}>{inventoryBody}</div>
    </main>
  );
}
