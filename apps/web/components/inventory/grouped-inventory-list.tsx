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
  malt: Wheat,
  fermentable: Wheat,
  hop: Hop,
  yeast: FlaskConical,
  water_treatment: Droplets,
  consumable: Package
};

const groupColors = {
  malt: "text-amber-600",
  fermentable: "text-amber-600",
  hop: "text-emerald-600",
  yeast: "text-violet-600",
  water_treatment: "text-sky-600",
  consumable: "text-zinc-500"
};

export function GroupedInventoryList({
  items,
  preferredCurrency,
  currencyRates,
  initialQuickStartDataByContext = null
}: Props) {
  const groups = groupInventoryItems(items);

  return (
    <section className="space-y-6" aria-label="Список ингредиентов по категориям">
      {groups.map((group) => {
        const Icon = groupIcons[group.key];
        const color = groupColors[group.key];

        return (
          <section key={group.key} className="space-y-3">
            <div className="flex items-center gap-2">
              <Icon className={`h-4 w-4 ${color}`} />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                {group.label}
              </h3>
              <span className="text-xs tabular-nums text-zinc-400">{group.items.length}</span>
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
