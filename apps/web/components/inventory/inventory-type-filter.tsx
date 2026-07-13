import React from "react";

import { inventoryTypeLabels, inventoryTypeOrder } from "@/features/inventory/page-model";
import type { IngredientType } from "@/features/ingredients/contracts";

type Props = {
  value: IngredientType | "all";
  onChange?: (value: IngredientType | "all") => void;
};

export function InventoryTypeFilter({ value, onChange }: Props) {
  const controlProps = onChange
    ? {
      value,
      onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onChange(event.target.value as IngredientType | "all")
    }
    : {
      defaultValue: value
    };

  return (
    <label className="text-sm font-medium" htmlFor="inventory-type-filter">
      Тип
      <select
        id="inventory-type-filter"
        name="type"
        {...controlProps}
        className="mt-1 min-w-40 rounded-md border px-3 py-2 text-base sm:text-sm"
      >
        <option value="all">Все типы</option>
        {inventoryTypeOrder.map((type) => (
          <option key={type} value={type}>{inventoryTypeLabels[type]}</option>
        ))}
      </select>
    </label>
  );
}
