import React from "react";
import { Droplets, FlaskConical, Leaf, Package, Wheat } from "lucide-react";
import type { IngredientCategory } from "@/features/ingredients/contracts";
import type { InventoryListItemDto } from "@/features/inventory/contracts";
import { groupInventoryItems } from "@/features/inventory/page-model";
import type { SystemCurrency, SystemCurrencyRateMap } from "@/features/system/currency";

import { InventoryListItem } from "./inventory-list-item";

type Props = {
  items: InventoryListItemDto[];
  preferredCurrency: SystemCurrency;
  currencyRates: SystemCurrencyRateMap;
};

const groupIcons: Record<IngredientCategory, React.ComponentType<{ className?: string }>> = {
  fermentable: Wheat,
  hop: Leaf,
  yeast: FlaskConical,
  water_treatment: Droplets,
  consumable: Package
};

const groupColors: Record<IngredientCategory, string> = {
  fermentable: "text-amber-600",
  hop: "text-emerald-600",
  yeast: "text-violet-600",
  water_treatment: "text-sky-600",
  consumable: "text-zinc-500"
};

export function GroupedInventoryList({ items, preferredCurrency, currencyRates }: Props) {
  const groups = groupInventoryItems(items);

  return (
    <section className="space-y-6" aria-label="Список ингредиентов по категориям">
      {groups.map((group) => {
        const Icon = groupIcons[group.category];
        const color = groupColors[group.category];

        return (
          <section key={group.category} className="space-y-3">
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
                />
              ))}
            </ul>
          </section>
        );
      })}
    </section>
  );
}
