import { ingredientCategories, ingredientTypes, type IngredientCategory, type IngredientType } from "../ingredients/contracts";
import { resolveIngredientCategory } from "../ingredients/taxonomy";
import { inventorySortOptions, type InventorySortOption, type InventoryListItemDto, type InventorySummaryDto } from "./contracts";
import type { BrewableRecipeDto } from "../recipes/contracts";
import { buildInventoryToolbarHref, defaultInventorySortOption } from "./page-model";

export function parseInventoryFilters(params: Record<string, string | string[] | undefined>) {
  const string = (key: string) => typeof params[key] === "string" ? params[key] as string : undefined;
  const type = string("type");
  const categoryValue = string("category");
  const legacyType = ingredientTypes.includes(type as IngredientType) ? type as IngredientType : undefined;
  const category = ingredientCategories.includes(categoryValue as IngredientCategory)
    ? categoryValue as IngredientCategory
    : legacyType ? resolveIngredientCategory({ type: legacyType }) ?? undefined : undefined;
  const subtypeValue = string("subtype");
  const subtype: "malt" | "fermentable" | undefined = subtypeValue === "malt" || subtypeValue === "fermentable" ? subtypeValue : type === "malt" ? "malt" : undefined;
  const sortValue = string("sort");
  const finished = string("finished");
  return {
    search: String(params.search ?? "").trim(), category, subtype,
    group: string("group")?.trim() || undefined,
    showFinished: finished != null ? finished === "true" : string("stock") === "all" || string("stock") === "empty",
    sort: inventorySortOptions.includes(sortValue as InventorySortOption) ? sortValue as InventorySortOption : defaultInventorySortOption
  };
}

export type InventoryFilters = ReturnType<typeof parseInventoryFilters>;
export const inventoryFiltersHref = (filters: InventoryFilters) => buildInventoryToolbarHref("/app/ingredients", {
  ...filters, category: filters.category ?? "all", subtype: filters.subtype ?? null, group: filters.group ?? null
});
export const inventoryServiceQuery = (filters: InventoryFilters) => ({
  category: filters.category, subtype: filters.subtype, group: filters.group,
  search: filters.search, sort: filters.sort, includeEmpty: filters.showFinished,
  stockState: filters.showFinished ? "all" as const : "in_stock" as const
});

export type InventoryViewData = {
  key: string;
  filters: InventoryFilters;
  items: InventoryListItemDto[];
  searchRescue: "layout" | null;
  summary: InventorySummaryDto;
  brewableRecipes: BrewableRecipeDto[];
};
type DateField = "createdAt" | "updatedAt" | "purchasedAt" | "freshnessDate" | "archivedAt";
type InventoryWireItem = Omit<InventoryListItemDto, DateField> & {
  createdAt: string; updatedAt: string;
  purchasedAt: string | null; freshnessDate: string | null; archivedAt: string | null;
};
export type InventoryViewResponse = Omit<InventoryViewData, "items"> & { items: InventoryWireItem[] };

export const restoreInventoryViewDates = (view: InventoryViewResponse): InventoryViewData => ({
  ...view,
  items: view.items.map(item => ({
    ...item, createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt),
    purchasedAt: item.purchasedAt ? new Date(item.purchasedAt) : null,
    freshnessDate: item.freshnessDate ? new Date(item.freshnessDate) : null,
    archivedAt: item.archivedAt ? new Date(item.archivedAt) : null
  }))
});
