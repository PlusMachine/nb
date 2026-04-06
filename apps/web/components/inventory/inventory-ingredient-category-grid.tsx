"use client";

import React from "react";
import { Droplets, FlaskConical, Leaf, Package, Wheat } from "lucide-react";

import type {
  IngredientCategory,
  IngredientSubtype
} from "@/features/ingredients/contracts";

export type InventoryIngredientCategoryValue = IngredientCategory | "malt" | "fermentable";

const categoryOptions: Array<{
  value: InventoryIngredientCategoryValue;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClassName: string;
}> = [
  { value: "malt", label: "Солод", icon: Wheat, iconClassName: "text-amber-600" },
  { value: "hop", label: "Хмель", icon: Leaf, iconClassName: "text-emerald-600" },
  { value: "yeast", label: "Дрожжи", icon: FlaskConical, iconClassName: "text-violet-600" },
  { value: "fermentable", label: "Сбраживаемое сырье", icon: Wheat, iconClassName: "text-amber-600" },
  { value: "water_treatment", label: "Водоподготовка", icon: Droplets, iconClassName: "text-sky-600" },
  { value: "consumable", label: "Расходники", icon: Package, iconClassName: "text-zinc-500" }
];

export const resolveInventoryIngredientContextFromCategoryValue = (
  value: InventoryIngredientCategoryValue
): {
  category: IngredientCategory;
  subtype: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
} => {
  const nextIsSubtype = value === "malt" || value === "fermentable";

  return {
    category: nextIsSubtype ? "fermentable" : value,
    subtype: nextIsSubtype ? value : null
  };
};

export const resolveInventoryIngredientCategoryValue = ({
  category,
  subtype
}: {
  category?: IngredientCategory | null;
  subtype?: IngredientSubtype | null;
}): InventoryIngredientCategoryValue | null => {
  if (!category) {
    return null;
  }

  if (
    category === "fermentable"
    && (subtype === "malt" || subtype === "fermentable")
  ) {
    return subtype;
  }

  return category;
};

type Props = {
  value: InventoryIngredientCategoryValue | null;
  onChange: (value: InventoryIngredientCategoryValue) => void;
  legend?: string;
  testId?: string;
};

export function InventoryIngredientCategoryGrid({
  value,
  onChange,
  legend = "Категория ингредиента",
  testId
}: Props) {
  return (
    <fieldset className="space-y-2" data-testid={testId}>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {categoryOptions.map((option) => {
          const Icon = option.icon;

          return (
            <button
              key={option.value}
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                onChange(option.value);
              }}
              onClick={(event) => {
                if (event.detail !== 0) {
                  return;
                }

                onChange(option.value);
              }}
              className={`rounded-md border px-3 py-2 text-xs transition ${value === option.value
                ? "border-black bg-zinc-100 text-zinc-950"
                : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
                }`}
            >
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${value === option.value ? "text-current" : option.iconClassName}`} />
                <span>{option.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
