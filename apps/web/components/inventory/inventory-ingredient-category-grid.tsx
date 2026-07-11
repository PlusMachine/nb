"use client";

import React from "react";
import { Droplets, FlaskConical, Hop, Package, Wheat } from "lucide-react";

import type {
  IngredientCategory,
  IngredientTechnicalData,
  IngredientSubtype
} from "@/features/ingredients/contracts";
import {
  isConsumableInventoryBroadGroup,
  resolveConsumableInventoryBroadGroup
} from "@/features/ingredients/consumables";

export type InventoryIngredientCategoryValue =
  | IngredientCategory
  | "consumable_supply"
  | "consumable_additive";

const categoryOptions: Array<{
  value: InventoryIngredientCategoryValue;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClassName: string;
  activeBg: string;
  activeText: string;
  activeRing: string;
}> = [
  { value: "fermentable", label: "Сбраживаемые", icon: Wheat, iconClassName: "text-amber-500 dark:text-amber-400", activeBg: "bg-amber-50 dark:bg-amber-500/15", activeText: "text-amber-800 dark:text-amber-300", activeRing: "ring-amber-200 dark:ring-amber-500/30" },
  { value: "hop", label: "Хмель", icon: Hop, iconClassName: "text-emerald-500 dark:text-emerald-400", activeBg: "bg-emerald-50 dark:bg-emerald-500/15", activeText: "text-emerald-800 dark:text-emerald-300", activeRing: "ring-emerald-200 dark:ring-emerald-500/30" },
  { value: "yeast", label: "Дрожжи", icon: FlaskConical, iconClassName: "text-violet-500 dark:text-violet-400", activeBg: "bg-violet-50 dark:bg-violet-500/15", activeText: "text-violet-800 dark:text-violet-300", activeRing: "ring-violet-200 dark:ring-violet-500/30" },
  { value: "water_treatment", label: "Водоподготовка", icon: Droplets, iconClassName: "text-sky-500 dark:text-sky-400", activeBg: "bg-sky-50 dark:bg-sky-500/15", activeText: "text-sky-800 dark:text-sky-300", activeRing: "ring-sky-200 dark:ring-sky-500/30" },
  { value: "consumable_supply", label: "Расходники", icon: Package, iconClassName: "text-muted-foreground", activeBg: "bg-muted", activeText: "text-foreground", activeRing: "ring-border" },
  { value: "consumable_additive", label: "Специи и добавки", icon: Package, iconClassName: "text-orange-500 dark:text-orange-400", activeBg: "bg-orange-50 dark:bg-orange-500/15", activeText: "text-orange-800 dark:text-orange-300", activeRing: "ring-orange-200 dark:ring-orange-500/30" }
];

export const resolveInventoryIngredientContextFromCategoryValue = (
  value: InventoryIngredientCategoryValue
): {
  category: IngredientCategory;
  subtype: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  group: string | null;
} => {
  return {
    category: value === "consumable_supply" || value === "consumable_additive"
      ? "consumable"
      : value,
    subtype: null,
    group: value === "consumable_supply"
      ? "inventory_supplies"
      : value === "consumable_additive"
        ? "inventory_additives"
        : null
  };
};

export const resolveInventoryIngredientCategoryValue = ({
  category,
  subtype,
  group,
  technicalData,
  groupName,
  itemKind
  }: {
  category?: IngredientCategory | null;
  subtype?: IngredientSubtype | null;
  group?: string | null;
  technicalData?: IngredientTechnicalData | null;
  groupName?: string | null;
  itemKind?: string | null;
}): InventoryIngredientCategoryValue | null => {
  if (!category) {
    return null;
  }

  if (category === "fermentable") {
    return "fermentable";
  }

  if (category === "consumable") {
    const resolvedGroup = isConsumableInventoryBroadGroup(group)
      ? group
      : resolveConsumableInventoryBroadGroup({
        technicalData,
        sourceCategory: group ?? null,
        groupName,
        subtype,
        itemKind
      });

    return resolvedGroup === "inventory_supplies"
      ? "consumable_supply"
      : "consumable_additive";
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
      <legend className="text-sm font-medium text-foreground">{legend}</legend>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {categoryOptions.map((option) => {
          const Icon = option.icon;
          const isActive = value === option.value;

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
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-medium transition-all duration-150 ${
                isActive
                  ? `${option.activeBg} ${option.activeText} border-transparent ring-1 ${option.activeRing} shadow-sm`
                  : "border-border bg-card text-muted-foreground hover:border-border hover:bg-muted active:scale-[0.97]"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-current" : option.iconClassName}`} />
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
