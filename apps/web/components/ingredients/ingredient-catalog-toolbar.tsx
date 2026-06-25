"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpDown,
  Check,
  Droplets,
  FlaskConical,
  Hop,
  RotateCcw,
  Package,
  Wheat
} from "lucide-react";

import type {
  IngredientCatalogSortOption,
  IngredientCatalogView,
  IngredientCategory
} from "@/features/ingredients/contracts";
import { ingredientCatalogSortOptions } from "@/features/ingredients/contracts";
import { ingredientCategoryLabels } from "@/features/ingredients/presentation";

type Props = {
  view: IngredientCatalogView;
  q: string;
  category: IngredientCategory | "all";
  subtype: "malt" | "fermentable" | null;
  sort: IngredientCatalogSortOption;
  canManage: boolean;
  counts: {
    total: number;
    customCount: number;
    catalogCount: number;
    byCategory: Record<IngredientCategory, number>;
    byFermentableSubtype: {
      malt: number;
      fermentable: number;
    };
  };
};

const sortLabels: Record<IngredientCatalogSortOption, string> = {
  name: "По названию",
  updated: "По обновлению",
  category: "По категории",
  brand: "По бренду"
};

const defaultCatalogSortOption: IngredientCatalogSortOption = "name";
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
    icon: Hop,
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

const buildCatalogHref = (
  pathname: string,
  params: {
    view: IngredientCatalogView;
    q: string;
    category: IngredientCategory | "all";
    subtype: "malt" | "fermentable" | null;
    sort: IngredientCatalogSortOption;
  }
) => {
  const searchParams = new URLSearchParams();

  if (params.view !== "all") {
    searchParams.set("view", params.view);
  }

  if (params.q.trim()) {
    searchParams.set("q", params.q.trim());
  }

  if (params.category !== "all") {
    searchParams.set("category", params.category);
  }

  if (params.subtype) {
    searchParams.set("subtype", params.subtype);
  }

  if (params.sort !== "name") {
    searchParams.set("sort", params.sort);
  }

  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
};

const buildCreateCustomIngredientHref = (
  params: {
    category: IngredientCategory | "all";
    subtype: "malt" | "fermentable" | null;
  }
) => {
  const searchParams = new URLSearchParams();

  if (params.category !== "all") {
    searchParams.set("category", params.category);
  }

  if (params.category === "fermentable" && params.subtype) {
    searchParams.set("subtype", params.subtype);
  }

  const query = searchParams.toString();
  return query ? `/catalog/new?${query}` : "/catalog/new";
};

export function IngredientCatalogToolbar({
  view,
  q,
  category,
  subtype,
  sort,
  canManage,
  counts
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(q);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isSearchFocused) {
      return;
    }

    setSearchValue(q);
  }, [isSearchFocused, q]);

  const currentHref = useMemo(() => buildCatalogHref(pathname, {
    view,
    q,
    category,
    subtype,
    sort
  }), [category, pathname, q, sort, subtype, view]);

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
    const trimmedServerSearch = q.trim();
    if (trimmedLocalSearch === trimmedServerSearch) {
      return;
    }

    const timer = window.setTimeout(() => {
      replaceHref(buildCatalogHref(pathname, {
        view,
        q: trimmedLocalSearch,
        category,
        subtype,
        sort
      }));
    }, searchDebounceMs);

    return () => window.clearTimeout(timer);
  }, [category, pathname, q, replaceHref, searchValue, sort, subtype, view]);

  useEffect(() => {
    if (!sortOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(event.target as Node)) {
        setSortOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [sortOpen]);

  const replaceWith = (next: {
    view?: IngredientCatalogView;
    category?: IngredientCategory | "all";
    subtype?: "malt" | "fermentable" | null;
    sort?: IngredientCatalogSortOption;
  }) => {
    replaceHref(buildCatalogHref(pathname, {
      view: next.view ?? view,
      q: searchValue,
      category: next.category ?? category,
      subtype: next.subtype !== undefined ? next.subtype : subtype,
      sort: next.sort ?? sort
    }));
  };

  const tabClassName = (active: boolean) => (
    `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${active
      ? "bg-zinc-950 text-white"
      : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"
    }`
  );
  const hasFilters = Boolean(searchValue.trim()) || category !== "all" || subtype !== null || sort !== defaultCatalogSortOption;
  const primaryButtons = [
    {
      key: "malt",
      label: "Солод",
      count: counts.byFermentableSubtype.malt,
      active: category === "fermentable" && subtype === "malt",
      meta: categoryMeta.fermentable,
      onClick: () => replaceWith({
        category: category === "fermentable" && subtype === "malt" ? "all" : "fermentable",
        subtype: category === "fermentable" && subtype === "malt" ? null : "malt"
      })
    },
    {
      key: "fermentable",
      label: "Сбраживаемое сырье",
      count: counts.byFermentableSubtype.fermentable,
      active: category === "fermentable" && subtype === "fermentable",
      meta: categoryMeta.fermentable,
      onClick: () => replaceWith({
        category: category === "fermentable" && subtype === "fermentable" ? "all" : "fermentable",
        subtype: category === "fermentable" && subtype === "fermentable" ? null : "fermentable"
      })
    },
    {
      key: "hop",
      label: ingredientCategoryLabels.hop,
      count: counts.byCategory.hop,
      active: category === "hop" && subtype === null,
      meta: categoryMeta.hop,
      onClick: () => replaceWith({ category: category === "hop" ? "all" : "hop", subtype: null })
    },
    {
      key: "yeast",
      label: ingredientCategoryLabels.yeast,
      count: counts.byCategory.yeast,
      active: category === "yeast" && subtype === null,
      meta: categoryMeta.yeast,
      onClick: () => replaceWith({ category: category === "yeast" ? "all" : "yeast", subtype: null })
    },
    {
      key: "water_treatment",
      label: ingredientCategoryLabels.water_treatment,
      count: counts.byCategory.water_treatment,
      active: category === "water_treatment" && subtype === null,
      meta: categoryMeta.water_treatment,
      onClick: () => replaceWith({ category: category === "water_treatment" ? "all" : "water_treatment", subtype: null })
    },
    {
      key: "consumable",
      label: ingredientCategoryLabels.consumable,
      count: counts.byCategory.consumable,
      active: category === "consumable" && subtype === null,
      meta: categoryMeta.consumable,
      onClick: () => replaceWith({ category: category === "consumable" ? "all" : "consumable", subtype: null })
    }
  ] as const;

  return (
    <section className="space-y-4 rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Link href={buildCatalogHref(pathname, { view: "all", q: searchValue, category, subtype, sort })} className={tabClassName(view === "all")}>
              Все ингредиенты
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${view === "all" ? "bg-white/15 text-white" : "bg-zinc-100 text-zinc-500"}`}>
                {counts.total}
              </span>
            </Link>
            {canManage ? (
              <Link href={buildCatalogHref(pathname, { view: "mine", q: searchValue, category, subtype, sort })} className={tabClassName(view === "mine")}>
                Пользовательские ингредиенты
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${view === "mine" ? "bg-white/15 text-white" : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"}`}>
                  {counts.customCount}
                </span>
              </Link>
            ) : null}
          </div>
          <p className="text-sm text-zinc-500">
            {!canManage
              ? `Системный каталог: ${counts.catalogCount} ингредиентов.`
              : view === "mine"
                ? "Пользовательские ингредиенты видны только вам и участвуют в pickers по всему приложению."
                : `Системный каталог: ${counts.catalogCount}. Пользовательские: ${counts.customCount}.`}
          </p>
        </div>

        {canManage ? (
          <Link
            href={buildCreateCustomIngredientHref({ category, subtype })}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-950 px-5 text-sm font-medium text-white"
          >
            Создать свой ингредиент
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
        <button
          type="button"
          onClick={() => replaceWith({ category: "all", subtype: null })}
          className={`group relative flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-center transition-all ${category === "all"
            ? "border-transparent bg-zinc-950 text-white ring-2 ring-zinc-300 shadow-sm"
            : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:shadow-sm"
            }`}
        >
          <span className={`text-xs font-semibold leading-tight ${category === "all" ? "text-white" : "text-zinc-700"}`}>
            Все категории
          </span>
          <span className={`text-[11px] font-medium tabular-nums ${category === "all" ? "text-zinc-200" : "text-zinc-400"}`}>
            {counts.total}
          </span>
        </button>

        {primaryButtons.map((button) => {
          const Icon = button.meta.icon;
          const isDisabled = button.count === 0 && !button.active;

          return (
            <button
              key={button.key}
              type="button"
              disabled={isDisabled}
              onClick={button.onClick}
              className={`group relative flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-center transition-all ${isDisabled
                ? "cursor-not-allowed border-zinc-100 bg-zinc-50 text-zinc-300 opacity-60"
                : button.active
                  ? `${button.meta.activeBg} ${button.meta.activeRing} border-transparent ring-2 shadow-sm`
                  : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm"
                }`}
            >
              <Icon className={`h-6 w-6 ${isDisabled ? "text-zinc-300" : button.active ? button.meta.activeColor : button.meta.color} transition-colors`} />
              <span className={`text-xs font-semibold leading-tight ${isDisabled ? "text-zinc-400" : button.active ? button.meta.activeColor : "text-zinc-700"}`}>
                {button.label}
              </span>
              <span className={`text-[11px] font-medium tabular-nums ${isDisabled ? "text-zinc-400" : button.active ? button.meta.activeColor : "text-zinc-400"}`}>
                {button.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <label className="block text-sm">
          Поиск
          <input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm"
            placeholder="Название, алиас, бренд, код"
          />
        </label>

        <div className="flex items-end justify-between gap-2">
          <div ref={sortRef} className="relative flex-1">
            <div className="mb-1 text-sm">Сортировка</div>
            <button
              type="button"
              onClick={() => setSortOpen((current) => !current)}
              className={`flex h-11 w-full items-center justify-between rounded-xl border px-3 text-sm transition-colors ${sort !== defaultCatalogSortOption
                ? "border-blue-200 bg-blue-50 text-blue-800"
                : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300 hover:bg-white"
                }`}
            >
              <span className="inline-flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4" />
                {sortLabels[sort]}
              </span>
              {sort !== defaultCatalogSortOption ? <Check className="h-4 w-4" /> : null}
            </button>

            {sortOpen ? (
              <div className="absolute right-0 z-20 mt-1 w-full rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
                {ingredientCatalogSortOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      replaceWith({ sort: option });
                      setSortOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-50 ${option === sort ? "font-medium text-zinc-950" : "text-zinc-600"
                      }`}
                  >
                    {sortLabels[option]}
                    {option === sort ? <Check className="h-3.5 w-3.5 text-blue-600" /> : null}
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
                replaceHref(buildCatalogHref(pathname, {
                  view,
                  q: "",
                  category: "all",
                  subtype: null,
                  sort: defaultCatalogSortOption
                }));
              }}
              className="mb-0.5 inline-flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Сбросить</span>
            </button>
          ) : null}
        </div>
      </div>

      {isPending ? <p className="text-xs text-zinc-400">Обновляем каталог…</p> : null}
    </section>
  );
}
