import React from "react";
import type { InventoryListItemDto } from "@/features/inventory/contracts";

import { InventoryQuantityEditor } from "./inventory-quantity-editor";

type Props = {
  item: InventoryListItemDto;
};

export function InventoryListItem({ item }: Props) {
  return (
    <li className="rounded-md border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{item.source.displayName}</p>
          <p className="text-xs text-zinc-500">Источник: {item.source.sourceKind === "catalog" ? "Каталог" : "Пользовательский"}</p>
          {item.archivedAt ? <p className="text-xs text-amber-700">Архивный ингредиент</p> : null}
        </div>
        <InventoryQuantityEditor item={item} />
      </div>
      {item.notes ? <p className="mt-2 text-sm text-zinc-600">{item.notes}</p> : null}
    </li>
  );
}
