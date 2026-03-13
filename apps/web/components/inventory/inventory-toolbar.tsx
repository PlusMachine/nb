"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

import type { IngredientCategory } from "@/features/ingredients/contracts";
import {
  defaultInventorySortOption,
  defaultInventoryShowFinished,
  buildInventoryToolbarHref,
  hasActiveInventoryFilters,
  inventoryCategoryLabels,
  inventoryCategoryOrder,
  inventorySortLabels
} from "@/features/inventory/page-model";
import type { InventorySortOption } from "@/features/inventory/contracts";

import { InventorySearchInput } from "./inventory-search-input";

type Props = {
  search: string;
  category: IngredientCategory | "all";
  showFinished: boolean;
  sort: InventorySortOption;
};

const searchDebounceMs = 250;

export function InventoryToolbar({ search, category, showFinished, sort }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(search);

  useEffect(() => {
    setSearchValue(search);
  }, [search]);

  const currentHref = useMemo(() => buildInventoryToolbarHref(pathname, {
    search,
    category,
    showFinished,
    sort
  }), [category, pathname, search, showFinished, sort]);

  const replaceHref = (href: string) => {
    if (href === currentHref) {
      return;
    }

    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  };

  useEffect(() => {
    const trimmedLocalSearch = searchValue.trim();
    const trimmedServerSearch = search.trim();
    if (trimmedLocalSearch === trimmedServerSearch) {
      return;
    }

    const timer = window.setTimeout(() => {
      replaceHref(buildInventoryToolbarHref(pathname, {
        search: trimmedLocalSearch,
        category,
        showFinished,
        sort
      }));
    }, searchDebounceMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [category, currentHref, pathname, search, searchValue, showFinished, sort]);

  const hasFilters = hasActiveInventoryFilters({
    search: searchValue,
    category,
    showFinished,
    sort
  });

  return (
    <section className="rounded-lg border p-3" aria-label="Фильтры по запасам">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
        <InventorySearchInput
          value={searchValue}
          category={category}
          showFinished={showFinished}
          onValueChange={setSearchValue}
          onSuggestionSelect={(value) => {
            setSearchValue(value);
            replaceHref(buildInventoryToolbarHref(pathname, {
              search: value,
              category,
              showFinished,
              sort
            }));
          }}
        />

        <label className="text-sm font-medium" htmlFor="inventory-category-filter">
          Категория
          <select
            id="inventory-category-filter"
            value={category}
            onChange={(event) => {
              const nextCategory = event.target.value as IngredientCategory | "all";
              replaceHref(buildInventoryToolbarHref(pathname, {
                search: searchValue,
                category: nextCategory,
                showFinished,
                sort
              }));
            }}
            className="mt-1 min-w-40 rounded-md border px-3 py-2"
          >
            <option value="all">Все категории</option>
            {inventoryCategoryOrder.map((itemCategory) => (
              <option key={itemCategory} value={itemCategory}>{inventoryCategoryLabels[itemCategory]}</option>
            ))}
          </select>
        </label>

        <label className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={showFinished}
            onChange={(event) => {
              replaceHref(buildInventoryToolbarHref(pathname, {
                search: searchValue,
                category,
                showFinished: event.target.checked,
                sort
              }));
            }}
            className="size-4"
          />
          Показывать закончившиеся
        </label>

        <label className="text-sm font-medium" htmlFor="inventory-sort-filter">
          Сортировка
          <select
            id="inventory-sort-filter"
            value={sort}
            onChange={(event) => {
              const nextSort = event.target.value as InventorySortOption;
              replaceHref(buildInventoryToolbarHref(pathname, {
                search: searchValue,
                category,
                showFinished,
                sort: nextSort
              }));
            }}
            className="mt-1 min-w-40 rounded-md border px-3 py-2"
          >
            {Object.entries(inventorySortLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-2 xl:ml-auto">
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setSearchValue("");
                replaceHref(buildInventoryToolbarHref(pathname, {
                  search: "",
                  category: "all",
                  showFinished: defaultInventoryShowFinished,
                  sort: defaultInventorySortOption
                }));
              }}
              className="rounded-md border px-3 py-2 text-sm"
            >
              Сбросить фильтры
            </button>
          ) : null}
          {isPending ? <p className="text-xs text-zinc-500">Обновляем список…</p> : null}
        </div>
      </div>
    </section>
  );
}
