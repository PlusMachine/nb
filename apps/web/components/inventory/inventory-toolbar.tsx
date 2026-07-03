"use client";

import React, { useCallback, useMemo, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpDown,
  Check,
  Droplets,
  Eye,
  EyeOff,
  FlaskConical,
  Hop,
  Package,
  RotateCcw,
  Wheat
} from "lucide-react";

import { DropdownMenu, type DropdownMenuItem } from "@nb/ui";
import type { IngredientCategory } from "@/features/ingredients/contracts";
import {
  consumableInventoryAdditiveGroups,
  consumableInventorySupplyGroups,
  isConsumableInventoryBroadGroup,
  resolveConsumableInventoryBroadGroup,
  resolveConsumablePickerGroupLabel
} from "@/features/ingredients/consumables";
import {
  ingredientPickerFermentableQuickStartGroupOrder,
  resolveFermentableQuickStartGroupLabel
} from "@/features/ingredients/picker-quick-start";
import {
  defaultInventorySortOption,
  defaultInventoryShowFinished,
  buildInventoryToolbarHref,
  hasActiveInventoryFilters,
  inventoryCategoryLabels,
  inventoryFermentableSubtypeLabels,
  inventoryPrimaryGroupLabels,
  inventorySortLabels,
  resolveInventoryToolbarCounts
} from "@/features/inventory/page-model";
import type { InventorySortOption } from "@/features/inventory/contracts";
import type { InventorySummaryDto } from "@/features/inventory/contracts";
import { useDebouncedUrlSearch } from "@/components/shared/use-debounced-url-search";

import { InventorySearchInput } from "./inventory-search-input";

type Props = {
  search: string;
  category: IngredientCategory | "all";
  subtype: "malt" | "fermentable" | null;
  group?: string | null;
  showFinished: boolean;
  sort: InventorySortOption;
  summary: InventorySummaryDto;
  visibleItemCount?: number;
};

type PrimaryButtonKey =
  | "fermentable"
  | "hop"
  | "yeast"
  | "water_treatment"
  | "consumable_supply"
  | "consumable_additive";

const searchDebounceMs = 250;
export const inventorySearchVisibilityThreshold = 12;

export const shouldShowInventorySearchInput = ({
  search,
  visibleItemCount
}: {
  search: string;
  visibleItemCount: number;
}) => Boolean(search.trim()) || visibleItemCount > inventorySearchVisibilityThreshold;

const categoryMeta: Record<PrimaryButtonKey, {
  icon: React.ComponentType<{ className?: string }>;
  activeColor: string;
  activeBg: string;
  activeRing: string;
  dotColor: string;
}> = {
  fermentable: {
    icon: Wheat,
    activeColor: "text-amber-800",
    activeBg: "bg-amber-50",
    activeRing: "ring-amber-300/80",
    dotColor: "bg-amber-500"
  },
  hop: {
    icon: Hop,
    activeColor: "text-emerald-800",
    activeBg: "bg-emerald-50",
    activeRing: "ring-emerald-300/80",
    dotColor: "bg-emerald-500"
  },
  yeast: {
    icon: FlaskConical,
    activeColor: "text-violet-800",
    activeBg: "bg-violet-50",
    activeRing: "ring-violet-300/80",
    dotColor: "bg-violet-500"
  },
  water_treatment: {
    icon: Droplets,
    activeColor: "text-sky-800",
    activeBg: "bg-sky-50",
    activeRing: "ring-sky-300/80",
    dotColor: "bg-sky-500"
  },
  consumable_supply: {
    icon: Package,
    activeColor: "text-zinc-800",
    activeBg: "bg-zinc-100",
    activeRing: "ring-zinc-300/80",
    dotColor: "bg-zinc-400"
  },
  consumable_additive: {
    icon: Package,
    activeColor: "text-orange-800",
    activeBg: "bg-orange-50",
    activeRing: "ring-orange-300/80",
    dotColor: "bg-orange-500"
  }
};

const fermentableChipValues = [
  "malt",
  ...ingredientPickerFermentableQuickStartGroupOrder
] as const;

const resolveConsumableToolbarBroadGroup = (group?: string | null) => {
  if (!group) {
    return null;
  }

  return isConsumableInventoryBroadGroup(group)
    ? group
    : resolveConsumableInventoryBroadGroup({
      sourceCategory: group
    });
};

export function InventoryToolbar({
  search,
  category,
  subtype,
  group = null,
  showFinished,
  sort,
  summary,
  visibleItemCount
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const currentHref = useMemo(() => buildInventoryToolbarHref(pathname, {
    search,
    category,
    subtype,
    group,
    showFinished,
    sort
  }), [category, group, pathname, search, showFinished, sort, subtype]);

  const replaceHref = useCallback((href: string) => {
    if (href === currentHref) {
      return;
    }

    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }, [currentHref, router]);

  const buildSearchHref = useCallback((nextSearch: string) => buildInventoryToolbarHref(pathname, {
    search: nextSearch,
    category,
    subtype,
    group,
    showFinished,
    sort
  }), [category, group, pathname, showFinished, sort, subtype]);

  const {
    inputValue: searchValue,
    setInputValue: setSearchValue,
    isPending: isSearchPending
  } = useDebouncedUrlSearch({ value: search, buildHref: buildSearchHref, debounceMs: searchDebounceMs });

  const hasFilters = hasActiveInventoryFilters({
    search: searchValue,
    category,
    subtype,
    group,
    showFinished,
    sort
  });
  const counts = resolveInventoryToolbarCounts(summary, showFinished);
  const hasFinishedItems = summary.emptyItems > 0;
  const effectiveVisibleItemCount = visibleItemCount ?? (showFinished ? summary.totalItems : summary.inStockItems);
  const showSearchInput = shouldShowInventorySearchInput({
    search: searchValue,
    visibleItemCount: effectiveVisibleItemCount
  });
  const activeConsumableBroadGroup = category === "consumable"
    ? resolveConsumableToolbarBroadGroup(group)
    : null;
  // При активном поиске счётчики по категориям не учитывают запрос и потому
  // расходятся с реальными числами в заголовках групп — прячем их, чтобы не
  // показывать неверные цифры (правда живёт в заголовке группы).
  const showCategoryCounts = !search.trim();

  const handlePrimaryFilterClick = (nextKey: PrimaryButtonKey) => {
    const isActive = (
      (nextKey === "fermentable" && category === "fermentable")
      || (nextKey === "hop" && category === "hop")
      || (nextKey === "yeast" && category === "yeast")
      || (nextKey === "water_treatment" && category === "water_treatment")
      || (nextKey === "consumable_supply" && category === "consumable" && activeConsumableBroadGroup === "inventory_supplies")
      || (nextKey === "consumable_additive" && category === "consumable" && activeConsumableBroadGroup === "inventory_additives")
    );

    if (isActive) {
      replaceHref(buildInventoryToolbarHref(pathname, {
        search: searchValue,
        category: "all",
        subtype: null,
        group: null,
        showFinished,
        sort
      }));
      return;
    }

    const nextState = nextKey === "fermentable"
      ? { category: "fermentable" as const, subtype: null, group: null }
      : nextKey === "consumable_supply"
        ? { category: "consumable" as const, subtype: null, group: "inventory_supplies" }
        : nextKey === "consumable_additive"
          ? { category: "consumable" as const, subtype: null, group: "inventory_additives" }
          : { category: nextKey, subtype: null, group: null };

    replaceHref(buildInventoryToolbarHref(pathname, {
      search: searchValue,
      category: nextState.category,
      subtype: nextState.subtype,
      group: nextState.group,
      showFinished,
      sort
    }));
  };

  const handleFermentableChipClick = (nextValue: (typeof fermentableChipValues)[number]) => {
    const isActive = nextValue === "malt"
      ? subtype === "malt" && !group
      : subtype === "fermentable" && group === nextValue;

    replaceHref(buildInventoryToolbarHref(pathname, {
      search: searchValue,
      category: "fermentable",
      subtype: isActive
        ? null
        : nextValue === "malt"
          ? "malt"
          : "fermentable",
      group: isActive || nextValue === "malt" ? null : nextValue,
      showFinished,
      sort
    }));
  };

  const handleConsumableChipClick = (nextValue: string) => {
    if (!activeConsumableBroadGroup) {
      return;
    }

    const isActive = group === nextValue;

    replaceHref(buildInventoryToolbarHref(pathname, {
      search: searchValue,
      category: "consumable",
      subtype: null,
      group: isActive ? activeConsumableBroadGroup : nextValue,
      showFinished,
      sort
    }));
  };

  const primaryButtons = [
    {
      key: "fermentable" as const,
      label: inventoryPrimaryGroupLabels.fermentable,
      count: counts.byPrimaryGroup.fermentable,
      active: category === "fermentable"
    },
    {
      key: "hop" as const,
      label: inventoryCategoryLabels.hop,
      count: counts.byPrimaryGroup.hop,
      active: category === "hop"
    },
    {
      key: "yeast" as const,
      label: inventoryCategoryLabels.yeast,
      count: counts.byPrimaryGroup.yeast,
      active: category === "yeast"
    },
    {
      key: "water_treatment" as const,
      label: inventoryCategoryLabels.water_treatment,
      count: counts.byPrimaryGroup.water_treatment,
      active: category === "water_treatment"
    },
    {
      key: "consumable_supply" as const,
      label: inventoryPrimaryGroupLabels.consumable_supply,
      count: counts.byPrimaryGroup.consumable_supply,
      active: category === "consumable" && activeConsumableBroadGroup === "inventory_supplies"
    },
    {
      key: "consumable_additive" as const,
      label: inventoryPrimaryGroupLabels.consumable_additive,
      count: counts.byPrimaryGroup.consumable_additive,
      active: category === "consumable" && activeConsumableBroadGroup === "inventory_additives"
    }
  ];

  return (
    <section className="space-y-3" aria-label="Фильтры по запасам">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        {primaryButtons.map((button) => {
          const meta = categoryMeta[button.key];
          const Icon = meta.icon;
          const isDisabled = button.count === 0 && !button.active;

          return (
            <button
              key={button.key}
              type="button"
              disabled={isDisabled}
              onClick={() => handlePrimaryFilterClick(button.key)}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-medium transition-all duration-150 sm:gap-2 sm:px-3 sm:text-[13px] ${
                isDisabled
                  ? "cursor-not-allowed border-zinc-100 bg-zinc-50 text-zinc-300"
                  : button.active
                    ? `${meta.activeBg} ${meta.activeRing} ring-1 border-transparent ${meta.activeColor} shadow-sm`
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.97]"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${isDisabled ? "text-zinc-300" : button.active ? "text-current" : ""}`} />
              <span className="truncate">{button.label}</span>
              {showCategoryCounts ? (
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none ${
                  isDisabled
                    ? "bg-zinc-100 text-zinc-400"
                    : button.active
                      ? "bg-white/70 text-current"
                      : "bg-zinc-100 text-zinc-500"
                }`}>
                  {button.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {category === "fermentable" ? (
        <div className="flex flex-wrap gap-1.5" data-testid="inventory-fermentable-subfilters">
          {fermentableChipValues.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => handleFermentableChipClick(value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                (value === "malt" && subtype === "malt" && !group)
                || (value !== "malt" && subtype === "fermentable" && group === value)
                  ? "border-amber-300 bg-amber-50 text-amber-900 shadow-sm"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
              }`}
            >
              {value === "malt" ? inventoryFermentableSubtypeLabels.malt : resolveFermentableQuickStartGroupLabel(value)}
            </button>
          ))}
        </div>
      ) : null}

      {category === "consumable" && activeConsumableBroadGroup ? (
        <div className="flex flex-wrap gap-1.5" data-testid="inventory-consumable-subfilters">
          {(activeConsumableBroadGroup === "inventory_supplies"
            ? consumableInventorySupplyGroups
            : consumableInventoryAdditiveGroups
          ).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => handleConsumableChipClick(value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                group === value
                  ? "border-amber-300 bg-amber-50 text-amber-900 shadow-sm"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
              }`}
            >
              {resolveConsumablePickerGroupLabel(value) ?? value}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        {showSearchInput ? (
          <div className="min-w-0 flex-1">
            <InventorySearchInput
              value={searchValue}
              onValueChange={setSearchValue}
            />
          </div>
        ) : null}

        <div className={`flex shrink-0 items-center gap-1.5 ${showSearchInput ? "" : "ml-auto"}`}>
          {hasFinishedItems ? (
            <button
              type="button"
              onClick={() => {
                replaceHref(buildInventoryToolbarHref(pathname, {
                  search: searchValue,
                  category,
                  subtype,
                  group,
                  showFinished: !showFinished,
                  sort
                }));
              }}
              title={showFinished ? "Скрыть закончившиеся" : "Показать закончившиеся"}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all duration-150 ${
                showFinished
                  ? "border-amber-200 bg-amber-50 text-amber-800 shadow-sm"
                  : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50"
              }`}
            >
              {showFinished ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{showFinished ? "Скрыть закончившиеся" : "Показать закончившиеся"}</span>
            </button>
          ) : null}

          <DropdownMenu
            trigger={
              <button
                type="button"
                title="Сортировка"
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all duration-150 ${
                  sort !== defaultInventorySortOption
                    ? "border-blue-200 bg-blue-50 text-blue-800 shadow-sm"
                    : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50"
                }`}
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{inventorySortLabels[sort]}</span>
              </button>
            }
            items={Object.entries(inventorySortLabels).map(([value, label]): DropdownMenuItem => ({
              key: value,
              label,
              icon: value === sort ? <Check className="h-4 w-4 text-blue-600" /> : undefined,
              onSelect: () => replaceHref(buildInventoryToolbarHref(pathname, {
                search: searchValue,
                category,
                subtype,
                group,
                showFinished,
                sort: value as InventorySortOption
              }))
            }))}
            align="end"
            aria-label="Сортировка"
          />

          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setSearchValue("");
                replaceHref(buildInventoryToolbarHref(pathname, {
                  search: "",
                  category: "all",
                  subtype: null,
                  group: null,
                  showFinished: defaultInventoryShowFinished,
                  sort: defaultInventorySortOption
                }));
              }}
              title="Сбросить фильтры"
              className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-500 transition-all duration-150 hover:border-zinc-300 hover:bg-zinc-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Сбросить</span>
            </button>
          ) : null}
        </div>
      </div>

      {isPending || isSearchPending ? (
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
          Обновляем список…
        </div>
      ) : null}
    </section>
  );
}
