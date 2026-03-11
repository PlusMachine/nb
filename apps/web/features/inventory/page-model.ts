import type { InventoryListItemDto, InventorySummaryDto } from "./contracts";
import type { IngredientType } from "../ingredients/contracts";

export const inventoryTypeOrder: IngredientType[] = ["fermentable", "hop", "yeast", "sugar", "adjunct", "fining", "misc"];

export const inventoryTypeLabels: Record<IngredientType, string> = {
  fermentable: "Ферментируемые",
  hop: "Хмель",
  yeast: "Дрожжи",
  sugar: "Сахара",
  adjunct: "Добавки",
  fining: "Осветлители",
  misc: "Прочее"
};

export type InventoryGroup = {
  type: IngredientType;
  label: string;
  items: InventoryListItemDto[];
};

export const groupInventoryItems = (items: InventoryListItemDto[]): InventoryGroup[] => {
  const grouped = new Map<IngredientType, InventoryListItemDto[]>();

  for (const item of items) {
    const existing = grouped.get(item.source.type);
    if (existing) {
      existing.push(item);
    } else {
      grouped.set(item.source.type, [item]);
    }
  }

  return inventoryTypeOrder
    .map((type) => ({
      type,
      label: inventoryTypeLabels[type],
      items: grouped.get(type) ?? []
    }))
    .filter((group) => group.items.length > 0);
};

export const inventorySummaryRows = (summary: InventorySummaryDto) => {
  return inventoryTypeOrder
    .filter((type) => summary.byType[type] > 0)
    .map((type) => ({
      type,
      label: inventoryTypeLabels[type],
      count: summary.byType[type]
    }));
};
