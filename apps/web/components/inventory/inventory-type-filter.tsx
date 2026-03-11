import React from "react";

import { inventoryTypeLabels } from "@/features/inventory/page-model";
import type { IngredientType } from "@/features/ingredients/contracts";

type Props = {
  value: IngredientType | "all";
};

export function InventoryTypeFilter({ value }: Props) {
  return (
    <label className="text-sm font-medium" htmlFor="inventory-type-filter">
      Тип
      <select
        id="inventory-type-filter"
        name="type"
        defaultValue={value}
        className="mt-1 min-w-40 rounded-md border px-3 py-2"
      >
        <option value="all">Все типы</option>
        {Object.entries(inventoryTypeLabels).map(([type, label]) => (
          <option key={type} value={type}>{label}</option>
        ))}
      </select>
    </label>
  );
}
