"use client";

import React from "react";

import { ingredientCategories, type IngredientCategory } from "@/features/ingredients/contracts";
import { ingredientCategoryLabels } from "@/features/ingredients/presentation";

type Props = {
  value: IngredientCategory;
  onChange: (category: IngredientCategory) => void;
  name?: string;
  legend?: string;
};

export function IngredientCategorySelector({
  value,
  onChange,
  name = "ingredientCategory",
  legend = "Категория ингредиента"
}: Props) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ingredientCategories.map((category) => (
          <label key={category} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={category}
              checked={value === category}
              onChange={() => onChange(category)}
              className="peer sr-only"
            />
            <span className="block rounded-md border px-3 py-2 text-center text-xs transition peer-checked:border-black peer-checked:bg-zinc-100">
              {ingredientCategoryLabels[category]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
