import React from "react";

import type { IngredientType } from "@/features/ingredients/contracts";

import { InventoryArchivedToggle } from "./inventory-archived-toggle";
import { InventorySearchInput } from "./inventory-search-input";
import { InventoryTypeFilter } from "./inventory-type-filter";

type Props = {
  search: string;
  type: IngredientType | "all";
  archived: boolean;
};

export function InventoryToolbar({ search, type, archived }: Props) {
  return (
    <form className="rounded-lg border p-3" method="get" aria-label="Фильтры по запасам">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <InventorySearchInput defaultValue={search} />
        <InventoryTypeFilter value={type} />
        <InventoryArchivedToggle checked={archived} />
        <div className="flex gap-2 md:ml-auto">
          <button type="submit" className="rounded-md bg-black px-3 py-2 text-sm text-white">Применить</button>
          <a href="/app/ingredients" className="rounded-md border px-3 py-2 text-sm">Сбросить</a>
        </div>
      </div>
    </form>
  );
}
