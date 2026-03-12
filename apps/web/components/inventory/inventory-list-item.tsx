import React from "react";
import type { InventoryListItemDto } from "@/features/inventory/contracts";

import { InventoryItemDetailsEditor } from "./inventory-item-details-editor";
import { InventoryQuantityEditor } from "./inventory-quantity-editor";

type Props = {
  item: InventoryListItemDto;
};

export function InventoryListItem({ item }: Props) {
  return (
    <li className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{item.source.displayName}</p>
          <p className="text-xs text-zinc-500">Источник: {item.source.sourceKind === "catalog" ? "Каталог" : "Пользовательский"}</p>
          {item.archivedAt ? <p className="text-xs text-amber-700">Архивный ингредиент</p> : null}
          {item.purchasedAt ? <p className="text-xs text-zinc-500">Дата покупки: {item.purchasedAt.toLocaleDateString("ru-RU")}</p> : null}
          {item.freshnessDate ? <p className="text-xs text-zinc-500">Годен до: {item.freshnessDate.toLocaleDateString("ru-RU")}</p> : null}
        </div>
        <div className="space-y-2">
          <InventoryQuantityEditor item={item} />
          <InventoryItemDetailsEditor item={item} />
        </div>
      </div>
      {item.notes ? <p className="mt-2 text-sm text-zinc-600">{item.notes}</p> : null}
    </li>
  );
}
