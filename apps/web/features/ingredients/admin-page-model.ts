import {
  ingredientCategories,
  type IngredientCatalogItemDto,
  type IngredientCategory,
  type IngredientCompletenessLevel
} from "./contracts";

export const ingredientCatalogStatuses = ["active", "draft", "archived", "merged"] as const;
export type IngredientCatalogStatus = (typeof ingredientCatalogStatuses)[number];

export const adminCatalogSortOptions = ["brand", "catalog", "name", "updated", "completeness"] as const;
export type AdminCatalogSortOption = (typeof adminCatalogSortOptions)[number];

export const defaultAdminCatalogSortOption: AdminCatalogSortOption = "brand";

export const ingredientCatalogCategoryOrder: IngredientCategory[] = [...ingredientCategories];

export const adminCatalogSortLabels: Record<AdminCatalogSortOption, string> = {
  brand: "По бренду",
  catalog: "По каталогу",
  name: "По названию",
  updated: "По обновлению",
  completeness: "По полноте"
};

export const ingredientCatalogStatusLabels: Record<IngredientCatalogStatus, string> = {
  active: "Активные",
  draft: "Черновики",
  archived: "Архив",
  merged: "Объединённые"
};

export const ingredientCompletenessLabels: Record<IngredientCompletenessLevel, string> = {
  minimum: "Минимум",
  recommended: "Рекомендуемый",
  full: "Полный"
};

type AdminIngredientsToolbarState = {
  q?: string;
  category?: IngredientCategory | "all";
  status?: IngredientCatalogStatus | "all";
  sort?: AdminCatalogSortOption;
  page?: number;
};

export type CatalogIngredientGroup = {
  key: string;
  label: string;
  items: IngredientCatalogItemDto[];
};

export const resolveCatalogBrandLabel = (item: Pick<IngredientCatalogItemDto, "brandName" | "manufacturer">) => {
  const normalizedBrand = item.brandName?.trim();
  if (normalizedBrand) {
    return normalizedBrand;
  }

  const normalizedManufacturer = item.manufacturer?.trim();
  if (normalizedManufacturer) {
    return normalizedManufacturer;
  }

  return "Без бренда";
};

export const parseAdminCatalogSort = (value: string | undefined): AdminCatalogSortOption => (
  adminCatalogSortOptions.includes(value as AdminCatalogSortOption)
    ? value as AdminCatalogSortOption
    : defaultAdminCatalogSortOption
);

export const parseIngredientCatalogStatus = (
  value: string | undefined
): IngredientCatalogStatus | undefined => (
  ingredientCatalogStatuses.includes(value as IngredientCatalogStatus)
    ? value as IngredientCatalogStatus
    : undefined
);

export const buildAdminIngredientsHref = (
  pathname: string,
  {
    q = "",
    category = "all",
    status = "all",
    sort = defaultAdminCatalogSortOption,
    page = 1
  }: AdminIngredientsToolbarState
) => {
  const params = new URLSearchParams();
  const trimmedSearch = q.trim();

  if (trimmedSearch) {
    params.set("q", trimmedSearch);
  }

  if (category !== "all") {
    params.set("category", category);
  }

  if (status !== "all") {
    params.set("status", status);
  }

  if (sort !== defaultAdminCatalogSortOption) {
    params.set("sort", sort);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
};

export const groupCatalogIngredientsByBrand = (
  items: IngredientCatalogItemDto[]
): CatalogIngredientGroup[] => {
  const grouped = new Map<string, IngredientCatalogItemDto[]>();

  for (const item of items) {
    const key = resolveCatalogBrandLabel(item);
    const existing = grouped.get(key);
    if (existing) {
      existing.push(item);
    } else {
      grouped.set(key, [item]);
    }
  }

  return Array.from(grouped.entries()).map(([key, groupItems]) => ({
    key,
    label: key,
    items: groupItems
  }));
};
