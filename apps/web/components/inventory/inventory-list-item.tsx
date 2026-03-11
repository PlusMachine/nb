import React from "react";
import type { InventoryListItemDto } from "@/features/inventory/contracts";

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
        </div>
        <p className="text-sm font-medium">{item.enteredQuantity} {item.enteredUnit}</p>
      </div>
      {item.notes ? <p className="mt-2 text-sm text-zinc-600">{item.notes}</p> : null}
    </li>
  );
}
