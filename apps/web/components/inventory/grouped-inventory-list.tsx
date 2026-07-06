import React from "react";
import { Droplets, FlaskConical, Hop, Package, Wheat } from "lucide-react";
import type { IngredientPickerQuickStartResultByContext } from "@/features/ingredients/contracts";
import type { InventoryListItemDto } from "@/features/inventory/contracts";
import { groupInventoryItems } from "@/features/inventory/page-model";
import type { SystemCurrency, SystemCurrencyRateMap } from "@/features/system/currency";

import { InventoryListItem } from "./inventory-list-item";

export type InventorySortEmphasis = "price" | "best_before" | null;

type Props = {
  items: InventoryListItemDto[];
  preferredCurrency: SystemCurrency;
  currencyRates: SystemCurrencyRateMap;
  initialQuickStartDataByContext?: IngredientPickerQuickStartResultByContext | null;
  /**
   * Плоский список без категорийных заголовков — для сквозных сортировок
   * (цена/срок), где группировка по категориям маскирует глобальный порядок.
   */
  layout?: "grouped" | "flat";
  sortEmphasis?: InventorySortEmphasis;
};

const groupIcons = {
  fermentable: Wheat,
  hop: Hop,
  yeast: FlaskConical,
  water_treatment: Droplets,
  consumable_supply: Package,
  consumable_additive: Package
};

const groupColors = {
  fermentable: "text-amber-500 dark:text-amber-400",
  hop: "text-emerald-500 dark:text-emerald-400",
  yeast: "text-violet-500 dark:text-violet-400",
  water_treatment: "text-sky-500 dark:text-sky-400",
  consumable_supply: "text-muted-foreground",
  consumable_additive: "text-orange-500 dark:text-orange-400"
};

const groupBg = {
  fermentable: "bg-amber-50 dark:bg-amber-500/15",
  hop: "bg-emerald-50 dark:bg-emerald-500/15",
  yeast: "bg-violet-50 dark:bg-violet-500/15",
  water_treatment: "bg-sky-50 dark:bg-sky-500/15",
  consumable_supply: "bg-muted",
  consumable_additive: "bg-orange-50 dark:bg-orange-500/15"
};

export function GroupedInventoryList({
  items,
  preferredCurrency,
  currencyRates,
  initialQuickStartDataByContext = null,
  layout = "grouped",
  sortEmphasis = null
}: Props) {
  if (layout === "flat") {
    return (
      <section aria-label="Список ингредиентов">
        <ul className="space-y-2">
          {items.map((item) => (
            <InventoryListItem
              key={item.id}
              item={item}
              preferredCurrency={preferredCurrency}
              currencyRates={currencyRates}
              initialQuickStartDataByContext={initialQuickStartDataByContext}
              sortEmphasis={sortEmphasis}
            />
          ))}
        </ul>
      </section>
    );
  }

  const groups = groupInventoryItems(items);

  return (
    <section className="space-y-8" aria-label="Список ингредиентов по категориям">
      {groups.map((group) => {
        const Icon = groupIcons[group.key];
        const color = groupColors[group.key];
        const bg = groupBg[group.key];

        return (
          <section key={group.key} className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${bg}`}>
                <Icon className={`h-3.5 w-3.5 ${color}`} />
              </div>
              <h3 className="text-sm font-semibold text-foreground">
                {group.label}
              </h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                {group.items.length}
              </span>
            </div>
            <ul className="space-y-2">
              {group.items.map((item) => (
                <InventoryListItem
                  key={item.id}
                  item={item}
                  preferredCurrency={preferredCurrency}
                  currencyRates={currencyRates}
                  initialQuickStartDataByContext={initialQuickStartDataByContext}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </section>
  );
}
