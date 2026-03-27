"use client";

import React from "react";

import { ingredientCategories, type IngredientCategory } from "@/features/ingredients/contracts";
import { ingredientCategoryLabels } from "@/features/ingredients/presentation";

export type IngredientCategorySelectorValue = IngredientCategory | "all";

type Props<TCategory extends IngredientCategorySelectorValue = IngredientCategory> = {
  value: TCategory;
  onChange: (category: TCategory) => void;
  name?: string;
  legend?: string;
  includeAll?: boolean;
  allLabel?: string;
};

export function IngredientCategorySelector<TCategory extends IngredientCategorySelectorValue = IngredientCategory>({
  value,
  onChange,
  name = "ingredientCategory",
  legend = "Категория ингредиента",
  includeAll = false,
  allLabel = "Все"
}: Props<TCategory>) {
  const options = includeAll
    ? (["all", ...ingredientCategories] as const satisfies readonly IngredientCategorySelectorValue[])
    : ingredientCategories;

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options.map((category) => (
          <label key={category} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={category}
              checked={value === category}
              onChange={() => onChange(category as TCategory)}
              className="peer sr-only"
            />
            <span className="block rounded-md border px-3 py-2 text-center text-xs transition peer-checked:border-black peer-checked:bg-zinc-100">
              {category === "all" ? allLabel : ingredientCategoryLabels[category]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
