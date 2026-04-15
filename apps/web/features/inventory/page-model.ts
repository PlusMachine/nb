import type {
  IngredientCategory,
  IngredientSubtype,
  IngredientType
} from "../ingredients/contracts";
import { ingredientTypes } from "../ingredients/contracts";
import { ingredientCategoryLabels } from "../ingredients/presentation";
import {
  resolveIngredientCategory,
  resolveIngredientSubtype
} from "../ingredients/taxonomy";
import type {
  InventoryListItemDto,
  InventorySortOption,
  InventorySummaryDto
} from "./contracts";

export const inventoryCategoryOrder: IngredientCategory[] = ["fermentable", "hop", "yeast", "water_treatment", "consumable"];

export const inventoryCategoryLabels: Record<IngredientCategory, string> = {
  fermentable: ingredientCategoryLabels.fermentable,
  hop: ingredientCategoryLabels.hop,
  yeast: ingredientCategoryLabels.yeast,
  water_treatment: ingredientCategoryLabels.water_treatment,
  consumable: ingredientCategoryLabels.consumable
};

export const inventoryPrimaryGroupOrder = [
  "malt",
  "fermentable",
  "hop",
  "yeast",
  "water_treatment",
  "consumable"
] as const;

export type InventoryPrimaryGroupKey = (typeof inventoryPrimaryGroupOrder)[number];

export const inventoryPrimaryGroupLabels: Record<InventoryPrimaryGroupKey, string> = {
  malt: "Солод",
  fermentable: "Сбраживаемое сырье",
  hop: inventoryCategoryLabels.hop,
  yeast: inventoryCategoryLabels.yeast,
  water_treatment: inventoryCategoryLabels.water_treatment,
  consumable: inventoryCategoryLabels.consumable
};

// Legacy compatibility for older admin/internal selectors that still use IngredientType.
export const inventoryTypeOrder: IngredientType[] = [...ingredientTypes];
export const inventoryTypeLabels: Record<IngredientType, string> = {
  malt: "Солод",
  fermentable: "Ферментируемые",
  hop: "Хмель",
  yeast: "Дрожжи",
  consumable: "Расходники",
  water_treatment: "Водоподготовка"
};

export const inventorySortLabels: Record<InventorySortOption, string> = {
  default: "По умолчанию",
  name: "По названию",
  quantity: "По количеству",
  updated: "По обновлению",
  best_before: "По сроку годности",
  price: "По цене"
};

export const defaultInventorySortOption: InventorySortOption = "default";
export const defaultInventoryShowFinished = false;

export const resolveInventoryShowFinished = (
  requestedShowFinished: boolean,
  summary: Pick<InventorySummaryDto, "emptyItems">
) => requestedShowFinished && summary.emptyItems > 0;

export const resolveInventoryItemCategory = (item: {
  ingredientCategory?: IngredientCategory | null;
  source: {
    category?: IngredientCategory | null;
    subtype?: IngredientSubtype | null;
    type: IngredientType;
  };
}): IngredientCategory => (
  item.ingredientCategory
  ?? item.source.category
  ?? resolveIngredientCategory({
    type: item.source.type,
    subtype: item.source.subtype
  })
  ?? "consumable"
);

const resolveInventoryItemSubtype = (item: {
  ingredientCategory?: IngredientCategory | null;
  ingredientSubtype?: IngredientSubtype | null;
  source: {
    category?: IngredientCategory | null;
    subtype?: IngredientSubtype | null;
    type: IngredientType;
  };
}): IngredientSubtype | null => (
  item.ingredientSubtype
  ?? item.source.subtype
  ?? resolveIngredientSubtype({
    category: item.ingredientCategory ?? item.source.category ?? undefined,
    type: item.source.type,
    subtype: item.source.subtype
  })
);

export const resolveInventoryPrimaryGroup = (item: {
  ingredientCategory?: IngredientCategory | null;
  ingredientSubtype?: IngredientSubtype | null;
  source: {
    category?: IngredientCategory | null;
    subtype?: IngredientSubtype | null;
    type: IngredientType;
  };
}): InventoryPrimaryGroupKey => {
  const category = resolveInventoryItemCategory(item);

  if (category === "hop" || category === "yeast" || category === "water_treatment" || category === "consumable") {
    return category;
  }

  return resolveInventoryItemSubtype(item) === "malt" ? "malt" : "fermentable";
};

export const resolveInventoryFilterLabel = ({
  category = "all",
  subtype = null
}: {
  category?: IngredientCategory | "all";
  subtype?: "malt" | "fermentable" | null;
}): string | null => {
  if (category === "all") {
    return null;
  }

  if (category === "fermentable" && subtype) {
    return inventoryPrimaryGroupLabels[subtype];
  }

  return inventoryCategoryLabels[category];
};

export type InventoryGroup = {
  key: InventoryPrimaryGroupKey;
  label: string;
  items: InventoryListItemDto[];
};

export const groupInventoryItems = (items: InventoryListItemDto[]): InventoryGroup[] => {
  const grouped = new Map<InventoryPrimaryGroupKey, InventoryListItemDto[]>();

  for (const item of items) {
    const key = resolveInventoryPrimaryGroup(item);
    const existing = grouped.get(key);
    if (existing) {
      existing.push(item);
    } else {
      grouped.set(key, [item]);
    }
  }

  return inventoryPrimaryGroupOrder
    .map((key) => ({
      key,
      label: inventoryPrimaryGroupLabels[key],
      items: grouped.get(key) ?? []
    }))
    .filter((group) => group.items.length > 0);
};

export const inventorySummaryRows = (summary: InventorySummaryDto) => (
  inventoryCategoryOrder
    .filter((category) => summary.byCategory[category] > 0)
    .map((category) => ({
      category,
      label: inventoryCategoryLabels[category],
      count: summary.byCategory[category]
    }))
);

type InventoryToolbarState = {
  search?: string;
  category?: IngredientCategory | "all";
  subtype?: "malt" | "fermentable" | null;
  showFinished?: boolean;
  sort?: InventorySortOption;
};

export const hasActiveInventoryFilters = ({
  search = "",
  category = "all",
  subtype = null,
  showFinished = defaultInventoryShowFinished,
  sort = defaultInventorySortOption
}: InventoryToolbarState) => (
  Boolean(search.trim())
  || category !== "all"
  || subtype !== null
  || showFinished !== defaultInventoryShowFinished
  || sort !== defaultInventorySortOption
);

export const buildInventoryToolbarHref = (
  pathname: string,
  {
    search = "",
    category = "all",
    subtype = null,
    showFinished = defaultInventoryShowFinished,
    sort = defaultInventorySortOption
  }: InventoryToolbarState
) => {
  const params = new URLSearchParams();
  const trimmedSearch = search.trim();

  if (trimmedSearch) {
    params.set("search", trimmedSearch);
  }

  if (category !== "all") {
    params.set("category", category);
  }

  if (subtype) {
    params.set("subtype", subtype);
  }

  if (showFinished !== defaultInventoryShowFinished) {
    params.set("finished", "true");
  }

  if (sort !== defaultInventorySortOption) {
    params.set("sort", sort);
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
};

export const resolveInventoryToolbarCounts = (summary: InventorySummaryDto, showFinished: boolean) => ({
  byCategory: showFinished ? summary.byCategory : summary.inStockByCategory,
  byFermentableSubtype: showFinished ? summary.byFermentableSubtype : summary.inStockByFermentableSubtype
});
