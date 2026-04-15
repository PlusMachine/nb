import React from "react";
import { Droplets, FlaskConical, Hop, Package, Wheat } from "lucide-react";
import type { IngredientPickerQuickStartResultByContext } from "@/features/ingredients/contracts";
import type { InventoryListItemDto } from "@/features/inventory/contracts";
import { groupInventoryItems } from "@/features/inventory/page-model";
import type { SystemCurrency, SystemCurrencyRateMap } from "@/features/system/currency";

import { InventoryListItem } from "./inventory-list-item";

type Props = {
  items: InventoryListItemDto[];
  preferredCurrency: SystemCurrency;
  currencyRates: SystemCurrencyRateMap;
  initialQuickStartDataByContext?: IngredientPickerQuickStartResultByContext | null;
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
  fermentable: "text-amber-500",
  hop: "text-emerald-500",
  yeast: "text-violet-500",
  water_treatment: "text-sky-500",
  consumable_supply: "text-zinc-400",
  consumable_additive: "text-orange-500"
};

const groupBg = {
  fermentable: "bg-amber-50",
  hop: "bg-emerald-50",
  yeast: "bg-violet-50",
  water_treatment: "bg-sky-50",
  consumable_supply: "bg-zinc-100",
  consumable_additive: "bg-orange-50"
};

export function GroupedInventoryList({
  items,
  preferredCurrency,
  currencyRates,
  initialQuickStartDataByContext = null
}: Props) {
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
              <h3 className="text-sm font-semibold text-zinc-700">
                {group.label}
              </h3>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium tabular-nums text-zinc-400">
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
