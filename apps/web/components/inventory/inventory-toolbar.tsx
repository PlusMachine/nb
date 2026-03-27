"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpDown,
  Check,
  Droplets,
  Eye,
  FlaskConical,
  Leaf,
  Package,
  RotateCcw,
  Wheat,
  X
} from "lucide-react";

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
import type { InventorySummaryDto } from "@/features/inventory/contracts";

import { InventorySearchInput } from "./inventory-search-input";

type Props = {
  search: string;
  category: IngredientCategory | "all";
  showFinished: boolean;
  sort: InventorySortOption;
  summary: InventorySummaryDto;
};

const searchDebounceMs = 250;

const categoryMeta: Record<IngredientCategory, {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  activeColor: string;
  activeBg: string;
  activeRing: string;
}> = {
  fermentable: {
    icon: Wheat,
    color: "text-amber-600",
    activeColor: "text-amber-800",
    activeBg: "bg-amber-50",
    activeRing: "ring-amber-300"
  },
  hop: {
    icon: Leaf,
    color: "text-emerald-600",
    activeColor: "text-emerald-800",
    activeBg: "bg-emerald-50",
    activeRing: "ring-emerald-300"
  },
  yeast: {
    icon: FlaskConical,
    color: "text-violet-600",
    activeColor: "text-violet-800",
    activeBg: "bg-violet-50",
    activeRing: "ring-violet-300"
  },
  water_treatment: {
    icon: Droplets,
    color: "text-sky-600",
    activeColor: "text-sky-800",
    activeBg: "bg-sky-50",
    activeRing: "ring-sky-300"
  },
  consumable: {
    icon: Package,
    color: "text-zinc-500",
    activeColor: "text-zinc-800",
    activeBg: "bg-zinc-100",
    activeRing: "ring-zinc-300"
  }
};

export function InventoryToolbar({ search, category, showFinished, sort, summary }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(search);
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchValue(search);
  }, [search]);

  const currentHref = useMemo(() => buildInventoryToolbarHref(pathname, {
    search,
    category,
    showFinished,
    sort
  }), [category, pathname, search, showFinished, sort]);

  const replaceHref = useCallback((href: string) => {
    if (href === currentHref) {
      return;
    }

    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }, [currentHref, router]);

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
  }, [category, pathname, replaceHref, search, searchValue, showFinished, sort]);

  useEffect(() => {
    if (!sortOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(event.target as Node)) {
        setSortOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [sortOpen]);

  const hasFilters = hasActiveInventoryFilters({
    search: searchValue,
    category,
    showFinished,
    sort
  });

  const handleCategoryClick = (nextCategory: IngredientCategory | "all") => {
    replaceHref(buildInventoryToolbarHref(pathname, {
      search: searchValue,
      category: nextCategory === category ? "all" : nextCategory,
      showFinished,
      sort
    }));
  };

  return (
    <section className="space-y-4" aria-label="Фильтры по запасам">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {inventoryCategoryOrder.map((cat) => {
          const meta = categoryMeta[cat];
          const Icon = meta.icon;
          const isActive = category === cat;
          const count = summary.byCategory[cat] ?? 0;

          return (
            <button
              key={cat}
              type="button"
              onClick={() => handleCategoryClick(cat)}
              className={`group relative flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-center transition-all ${
                isActive
                  ? `${meta.activeBg} ${meta.activeRing} ring-2 border-transparent shadow-sm`
                  : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm"
              }`}
            >
              <Icon className={`h-6 w-6 ${isActive ? meta.activeColor : meta.color} transition-colors`} />
              <span className={`text-xs font-semibold leading-tight ${isActive ? meta.activeColor : "text-zinc-700"}`}>
                {inventoryCategoryLabels[cat]}
              </span>
              {count > 0 ? (
                <span className={`text-[11px] font-medium tabular-nums ${isActive ? meta.activeColor : "text-zinc-400"}`}>
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1">
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
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              replaceHref(buildInventoryToolbarHref(pathname, {
                search: searchValue,
                category,
                showFinished: !showFinished,
                sort
              }));
            }}
            title={showFinished ? "Скрыть закончившиеся" : "Показать закончившиеся"}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              showFinished
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Закончившиеся</span>
          </button>

          <div ref={sortRef} className="relative">
            <button
              type="button"
              onClick={() => setSortOpen(!sortOpen)}
              title="Сортировка"
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                sort !== defaultInventorySortOption
                  ? "border-blue-200 bg-blue-50 text-blue-800"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
              }`}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{inventorySortLabels[sort]}</span>
            </button>

            {sortOpen ? (
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
                {Object.entries(inventorySortLabels).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      replaceHref(buildInventoryToolbarHref(pathname, {
                        search: searchValue,
                        category,
                        showFinished,
                        sort: value as InventorySortOption
                      }));
                      setSortOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-50 ${
                      value === sort ? "font-medium text-zinc-950" : "text-zinc-600"
                    }`}
                  >
                    {label}
                    {value === sort ? <Check className="h-3.5 w-3.5 text-blue-600" /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

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
              title="Сбросить фильтры"
              className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Сбросить</span>
            </button>
          ) : null}
        </div>
      </div>

      {isPending ? (
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
          Обновляем список…
        </div>
      ) : null}
    </section>
  );
}
