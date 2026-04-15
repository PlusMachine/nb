import type {
  IngredientCategory,
  IngredientSubtype,
  IngredientType
} from "../ingredients/contracts";
import { ingredientTypes } from "../ingredients/contracts";
import {
  isConsumableInventoryBroadGroup,
  resolveConsumableInventoryBroadGroup,
  resolveConsumableInventoryBroadGroupLabel
} from "../ingredients/consumables";
import {
  resolveIngredientCategory,
  resolveIngredientSubtype
} from "../ingredients/taxonomy";
import type {
  InventoryListItemDto,
  InventoryPrimaryGroupKey,
  InventorySortOption,
  InventorySummaryDto
} from "./contracts";
import { inventoryPrimaryGroupKeys } from "./contracts";

export const inventoryCategoryOrder: IngredientCategory[] = ["fermentable", "hop", "yeast", "water_treatment", "consumable"];

export const inventoryCategoryLabels: Record<IngredientCategory, string> = {
  fermentable: "Сбраживаемые",
  hop: "Хмель",
  yeast: "Дрожжи",
  water_treatment: "Водоподготовка",
  consumable: "Расходники и добавки"
};

export const inventoryFermentableSubtypeLabels: Record<Extract<IngredientSubtype, "malt" | "fermentable">, string> = {
  malt: "Солод",
  fermentable: "Сбраживаемое сырье"
};

export const inventoryPrimaryGroupOrder: InventoryPrimaryGroupKey[] = [...inventoryPrimaryGroupKeys];

export const inventoryPrimaryGroupLabels: Record<InventoryPrimaryGroupKey, string> = {
  fermentable: inventoryCategoryLabels.fermentable,
  hop: inventoryCategoryLabels.hop,
  yeast: inventoryCategoryLabels.yeast,
  water_treatment: inventoryCategoryLabels.water_treatment,
  consumable_supply: "Расходники",
  consumable_additive: "Другие добавки"
};

// Legacy compatibility for older admin/internal selectors that still use IngredientType.
export const inventoryTypeOrder: IngredientType[] = [...ingredientTypes];
export const inventoryTypeLabels: Record<IngredientType, string> = {
  malt: "Солод",
  fermentable: "Сбраживаемые",
  hop: "Хмель",
  yeast: "Дрожжи",
  consumable: "Расходники и добавки",
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

export const resolveInventoryConsumablePrimaryGroup = (item: {
  ingredientSubtype?: IngredientSubtype | null;
  source: {
    technicalData?: InventoryListItemDto["source"]["technicalData"] | null;
    groupName?: string | null;
    subtype?: IngredientSubtype | null;
    itemKind?: string | null;
  };
}): Extract<InventoryPrimaryGroupKey, "consumable_supply" | "consumable_additive"> => (
  resolveConsumableInventoryBroadGroup({
    technicalData: item.source.technicalData,
    groupName: item.source.groupName ?? null,
    subtype: item.source.subtype ?? item.ingredientSubtype ?? null,
    itemKind: item.source.itemKind ?? null
  }) === "inventory_supplies"
    ? "consumable_supply"
    : "consumable_additive"
);

export const resolveInventoryPrimaryGroup = (item: {
  ingredientCategory?: IngredientCategory | null;
  ingredientSubtype?: IngredientSubtype | null;
  source: {
    category?: IngredientCategory | null;
    subtype?: IngredientSubtype | null;
    type: IngredientType;
    technicalData?: InventoryListItemDto["source"]["technicalData"] | null;
    groupName?: string | null;
    itemKind?: string | null;
  };
}): InventoryPrimaryGroupKey => {
  const category = resolveInventoryItemCategory(item);

  if (category === "consumable") {
    return resolveInventoryConsumablePrimaryGroup(item);
  }

  if (category === "fermentable") {
    return "fermentable";
  }

  return category;
};

export const resolveInventoryFilterLabel = ({
  category = "all",
  subtype = null,
  group = null
}: {
  category?: IngredientCategory | "all";
  subtype?: "malt" | "fermentable" | null;
  group?: string | null;
}): string | null => {
  if (category === "all") {
    return null;
  }

  if (category === "consumable" && group && isConsumableInventoryBroadGroup(group)) {
    return resolveConsumableInventoryBroadGroupLabel(group);
  }

  if (category === "fermentable" && subtype) {
    return inventoryFermentableSubtypeLabels[subtype];
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
  inventoryPrimaryGroupOrder
    .filter((group) => summary.byPrimaryGroup[group] > 0)
    .map((group) => ({
      category: group,
      label: inventoryPrimaryGroupLabels[group],
      count: summary.byPrimaryGroup[group]
    }))
);

type InventoryToolbarState = {
  search?: string;
  category?: IngredientCategory | "all";
  subtype?: "malt" | "fermentable" | null;
  group?: string | null;
  showFinished?: boolean;
  sort?: InventorySortOption;
};

export const hasActiveInventoryFilters = ({
  search = "",
  category = "all",
  subtype = null,
  group = null,
  showFinished = defaultInventoryShowFinished,
  sort = defaultInventorySortOption
}: InventoryToolbarState) => (
  Boolean(search.trim())
  || category !== "all"
  || subtype !== null
  || Boolean(group)
  || showFinished !== defaultInventoryShowFinished
  || sort !== defaultInventorySortOption
);

export const buildInventoryToolbarHref = (
  pathname: string,
  {
    search = "",
    category = "all",
    subtype = null,
    group = null,
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

  if (group) {
    params.set("group", group);
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
  byPrimaryGroup: showFinished ? summary.byPrimaryGroup : summary.inStockByPrimaryGroup,
  byFermentableSubtype: showFinished ? summary.byFermentableSubtype : summary.inStockByFermentableSubtype
});
