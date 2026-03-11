import React from "react";
import type { InventoryListItemDto } from "@/features/inventory/contracts";
import { groupInventoryItems } from "@/features/inventory/page-model";

import { InventoryListItem } from "./inventory-list-item";

type Props = {
  items: InventoryListItemDto[];
};

export function GroupedInventoryList({ items }: Props) {
  const groups = groupInventoryItems(items);

  return (
    <section className="space-y-4 rounded-lg border p-4" aria-label="Список ингредиентов по типам">
      <h2 className="text-lg font-semibold">Ингредиенты</h2>
      <div className="space-y-4">
        {groups.map((group) => (
          <section key={group.type} className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{group.label}</h3>
            <ul className="space-y-2">
              {group.items.map((item) => <InventoryListItem key={item.id} item={item} />)}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
