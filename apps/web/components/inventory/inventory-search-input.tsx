"use client";

import React from "react";

import { IngredientPicker } from "@/components/ingredients/ingredient-picker";
import type {
  IngredientCategory,
  IngredientSuggestionItem,
  IngredientSubtype
} from "@/features/ingredients/contracts";

type Props = {
  value: string;
  category: IngredientCategory | "all";
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  group?: string | null;
  showFinished: boolean;
  onValueChange: (value: string) => void;
  onSuggestionSelect: (value: string, item: IngredientSuggestionItem) => void;
};

export const buildInventorySuggestionParams = ({
  q,
  category,
  subtype,
  group,
  showFinished,
  limit
}: {
  q: string;
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  group?: string | null;
  showFinished: boolean;
  limit: number;
}) => {
  const params = new URLSearchParams({ q: q.trim(), limit: String(limit) });
  if (category) {
    params.set("category", category);
  }
  if (subtype) {
    params.set("subtype", subtype);
  }
  if (group) {
    params.set("group", group);
  }
  if (showFinished) {
    params.set("finished", "true");
  }

  return params;
};

export function InventorySearchInput({
  value,
  category,
  subtype = null,
  group = null,
  showFinished,
  onValueChange,
  onSuggestionSelect
}: Props) {
  const effectiveCategory = category === "all" ? undefined : category;

  return (
    <IngredientPicker
      value={value}
      category={effectiveCategory}
      onValueChange={onValueChange}
      onSelect={(item) => {
        onValueChange(item.displayName);
        onSuggestionSelect(item.displayName, item);
      }}
      placeholder="Поиск ингредиентов..."
      emptyCta={<p className="text-xs text-zinc-500">В текущем списке ничего не найдено. Попробуйте другой запрос или поменяйте фильтры.</p>}
      searchIngredients={async ({ q, category: nextCategory, limit, signal }) => {
        const params = buildInventorySuggestionParams({
          q,
          category: nextCategory,
          subtype,
          group,
          showFinished,
          limit
        });
        const response = await fetch(`/api/inventory/suggestions?${params.toString()}`, { signal });
        if (!response.ok) {
          return [];
        }

        const data = await response.json() as { items: IngredientSuggestionItem[] };
        return data.items;
      }}
    />
  );
}
