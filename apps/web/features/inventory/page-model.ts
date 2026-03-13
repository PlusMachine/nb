import type {
  IngredientCategory,
  IngredientSubtype,
  IngredientType
} from "../ingredients/contracts";
import { ingredientTypes } from "../ingredients/contracts";
import { ingredientCategoryLabels } from "../ingredients/presentation";
import { resolveIngredientCategory } from "../ingredients/taxonomy";
import type {
  InventoryListItemDto,
  InventorySortOption,
  InventorySummaryDto
} from "./contracts";

export const inventoryCategoryOrder: IngredientCategory[] = ["fermentable", "hop", "yeast", "water_prep", "misc"];

export const inventoryCategoryLabels: Record<IngredientCategory, string> = {
  fermentable: ingredientCategoryLabels.fermentable,
  hop: ingredientCategoryLabels.hop,
  yeast: ingredientCategoryLabels.yeast,
  water_prep: ingredientCategoryLabels.water_prep,
  misc: ingredientCategoryLabels.misc
};

// Legacy compatibility for older admin/internal selectors that still use IngredientType.
export const inventoryTypeOrder: IngredientType[] = [...ingredientTypes];
export const inventoryTypeLabels: Record<IngredientType, string> = {
  fermentable: "Ферментируемые",
  hop: "Хмель",
  yeast: "Дрожжи",
  sugar: "Сахара",
  adjunct: "Добавки",
  fining: "Осветлители",
  misc: "Прочее"
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
  ?? "misc"
);

export type InventoryGroup = {
  category: IngredientCategory;
  label: string;
  items: InventoryListItemDto[];
};

export const groupInventoryItems = (items: InventoryListItemDto[]): InventoryGroup[] => {
  const grouped = new Map<IngredientCategory, InventoryListItemDto[]>();

  for (const item of items) {
    const category = resolveInventoryItemCategory(item);
    const existing = grouped.get(category);
    if (existing) {
      existing.push(item);
    } else {
      grouped.set(category, [item]);
    }
  }

  return inventoryCategoryOrder
    .map((category) => ({
      category,
      label: inventoryCategoryLabels[category],
      items: grouped.get(category) ?? []
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
  showFinished?: boolean;
  sort?: InventorySortOption;
};

export const hasActiveInventoryFilters = ({
  search = "",
  category = "all",
  showFinished = defaultInventoryShowFinished,
  sort = defaultInventorySortOption
}: InventoryToolbarState) => (
  Boolean(search.trim())
  || category !== "all"
  || showFinished !== defaultInventoryShowFinished
  || sort !== defaultInventorySortOption
);

export const buildInventoryToolbarHref = (
  pathname: string,
  {
    search = "",
    category = "all",
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

  if (showFinished !== defaultInventoryShowFinished) {
    params.set("finished", "true");
  }

  if (sort !== defaultInventorySortOption) {
    params.set("sort", sort);
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
};
