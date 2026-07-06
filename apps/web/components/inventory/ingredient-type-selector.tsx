"use client";

import React from "react";
import type { IngredientType } from "@/features/ingredients/contracts";
import { inventoryTypeLabels, inventoryTypeOrder } from "@/features/inventory/page-model";

type Props = {
  value: IngredientType;
  onChange: (type: IngredientType) => void;
  name?: string;
};

export function IngredientTypeSelector({ value, onChange, name = "ingredientType" }: Props) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Тип ингредиента</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {inventoryTypeOrder.map((type) => (
          <label key={type} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={type}
              checked={value === type}
              onChange={() => onChange(type)}
              className="peer sr-only"
            />
            <span className="block rounded-md border px-3 py-2 text-center text-xs transition peer-checked:border-foreground peer-checked:bg-muted">
              {inventoryTypeLabels[type]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
