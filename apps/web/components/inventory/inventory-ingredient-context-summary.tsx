"use client";

import React from "react";

import type {
  IngredientCategory,
  IngredientSubtype,
  IngredientSuggestionItem
} from "@/features/ingredients/contracts";
import type { InventorySourceDto } from "@/features/inventory/contracts";

const inventoryIngredientContextCategoryLabels: Record<IngredientCategory, string> = {
  fermentable: "Ферментируемые",
  hop: "Хмель",
  yeast: "Дрожжи",
  water_treatment: "Водоподготовка",
  consumable: "Расходники"
};

type ContextSourceKind = "catalog" | "custom";
type ContextSourceLabelStyle = "from" | "short";

export const resolveInventoryIngredientContextCategoryLabel = ({
  category,
  subtype
}: {
  category?: IngredientCategory | null;
  subtype?: IngredientSubtype | null;
}) => {
  if (!category) {
    return null;
  }

  if (category === "fermentable") {
    if (subtype === "malt") {
      return "Солод";
    }

    if (subtype === "fermentable") {
      return "Сбраживаемое сырье";
    }
  }

  return inventoryIngredientContextCategoryLabels[category];
};

export const resolveInventoryIngredientContextSourceLabel = ({
  source,
  style = "from"
}: {
  source: ContextSourceKind;
  style?: ContextSourceLabelStyle;
}) => {
  if (source === "custom") {
    return "Свой";
  }

  return style === "short" ? "Каталог" : "Из каталога";
};

export const resolveInventoryIngredientContextSummary = ({
  category,
  subtype,
  source,
  sourceLabelStyle = "from"
}: {
  category?: IngredientCategory | null;
  subtype?: IngredientSubtype | null;
  source: ContextSourceKind;
  sourceLabelStyle?: ContextSourceLabelStyle;
}) => {
  const categoryLabel = resolveInventoryIngredientContextCategoryLabel({ category, subtype });
  const sourceLabel = resolveInventoryIngredientContextSourceLabel({
    source,
    style: sourceLabelStyle
  });

  return categoryLabel ? `${categoryLabel} · ${sourceLabel}` : sourceLabel;
};

export const resolveInventoryIngredientContextSummaryFromSuggestion = (
  item: Pick<IngredientSuggestionItem, "category" | "subtype" | "source">,
  options?: {
    sourceLabelStyle?: ContextSourceLabelStyle;
  }
) => resolveInventoryIngredientContextSummary({
  category: item.category,
  subtype: item.subtype ?? null,
  source: item.source,
  sourceLabelStyle: options?.sourceLabelStyle
});

export const resolveInventoryIngredientContextSummaryFromInventorySource = (
  source: Pick<InventorySourceDto, "category" | "subtype" | "sourceKind">,
  options?: {
    sourceLabelStyle?: ContextSourceLabelStyle;
  }
) => resolveInventoryIngredientContextSummary({
  category: source.category,
  subtype: source.subtype ?? null,
  source: source.sourceKind,
  sourceLabelStyle: options?.sourceLabelStyle
});

type Props = {
  summary: string;
  testId?: string;
  className?: string;
};

export function InventoryIngredientContextSummary({
  summary,
  testId,
  className = ""
}: Props) {
  return (
    <p
      className={`text-xs font-medium text-zinc-500 ${className}`.trim()}
      data-testid={testId}
    >
      {summary}
    </p>
  );
}
