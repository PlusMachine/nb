"use client";

import React from "react";

import type {
  IngredientCategory,
  IngredientTechnicalData,
  IngredientSubtype,
  IngredientSuggestionItem
} from "@/features/ingredients/contracts";
import { resolveConsumableInventoryBroadGroup } from "@/features/ingredients/consumables";
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
  subtype,
  technicalData,
  groupName,
  itemKind
}: {
  category?: IngredientCategory | null;
  subtype?: IngredientSubtype | null;
  technicalData?: IngredientTechnicalData | null;
  groupName?: string | null;
  itemKind?: string | null;
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

  if (category === "consumable") {
    return resolveConsumableInventoryBroadGroup({
      technicalData,
      groupName,
      subtype,
      itemKind
    }) === "inventory_supplies"
      ? "Расходники"
      : "Другие добавки";
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
  technicalData,
  groupName,
  itemKind,
  source,
  sourceLabelStyle = "from"
}: {
  category?: IngredientCategory | null;
  subtype?: IngredientSubtype | null;
  technicalData?: IngredientTechnicalData | null;
  groupName?: string | null;
  itemKind?: string | null;
  source: ContextSourceKind;
  sourceLabelStyle?: ContextSourceLabelStyle;
}) => {
  const categoryLabel = resolveInventoryIngredientContextCategoryLabel({
    category,
    subtype,
    technicalData,
    groupName,
    itemKind
  });
  const sourceLabel = resolveInventoryIngredientContextSourceLabel({
    source,
    style: sourceLabelStyle
  });

  return categoryLabel ? `${categoryLabel} · ${sourceLabel}` : sourceLabel;
};

export const resolveInventoryIngredientContextSummaryFromSuggestion = (
  item: Pick<IngredientSuggestionItem, "category" | "subtype" | "source" | "technicalData" | "groupName" | "itemKind">,
  options?: {
    sourceLabelStyle?: ContextSourceLabelStyle;
  }
) => resolveInventoryIngredientContextSummary({
  category: item.category,
  subtype: item.subtype ?? null,
  technicalData: item.technicalData ?? null,
  groupName: item.groupName ?? null,
  itemKind: item.itemKind ?? null,
  source: item.source,
  sourceLabelStyle: options?.sourceLabelStyle
});

export const resolveInventoryIngredientContextSummaryFromInventorySource = (
  source: Pick<InventorySourceDto, "category" | "subtype" | "sourceKind" | "technicalData" | "groupName" | "itemKind">,
  options?: {
    sourceLabelStyle?: ContextSourceLabelStyle;
  }
) => resolveInventoryIngredientContextSummary({
  category: source.category,
  subtype: source.subtype ?? null,
  technicalData: source.technicalData ?? null,
  groupName: source.groupName ?? null,
  itemKind: source.itemKind ?? null,
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
      className={`text-xs font-medium text-muted-foreground ${className}`.trim()}
      data-testid={testId}
    >
      {summary}
    </p>
  );
}
