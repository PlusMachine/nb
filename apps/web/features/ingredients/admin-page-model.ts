import type { BadgeTone } from "@nb/ui";

import {
  countAdminBulkFailures,
  describeAdminBulkFailures,
  groupAdminBulkFailures,
  type AdminBulkFailure,
  type AdminBulkFailureGroup
} from "@/lib/admin-bulk";

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

export const adminCatalogPageSizeOptions = [20, 50, 100] as const;
export const defaultAdminCatalogPageSize = 50;

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

// Лейблы фильтров — множественное число («Черновики»), в строке списка нужен
// статус самой карточки («Черновик»).
export const ingredientCatalogStatusRowLabels: Record<IngredientCatalogStatus, string> = {
  active: "Активен",
  draft: "Черновик",
  archived: "Архив",
  merged: "Объединён"
};

export const ingredientCatalogStatusTones: Record<IngredientCatalogStatus, BadgeTone> = {
  active: "success",
  draft: "warning",
  archived: "neutral",
  merged: "info"
};

export const ingredientCompletenessTones: Record<IngredientCompletenessLevel, BadgeTone> = {
  minimum: "danger",
  recommended: "warning",
  full: "success"
};

export const ingredientVisibilityLabels: Record<IngredientCatalogItemDto["visibility"], string> = {
  public: "Публичный",
  internal: "Внутренний"
};

export const catalogBulkFailureReasons = ["merged", "missing", "invalid", "failed"] as const;
export type CatalogBulkFailureReason = (typeof catalogBulkFailureReasons)[number];

export type CatalogBulkFailure = AdminBulkFailure<CatalogBulkFailureReason>;
export type CatalogBulkFailureGroup = AdminBulkFailureGroup<CatalogBulkFailureReason>;

export const catalogBulkFailureLabels: Record<CatalogBulkFailureReason, string> = {
  merged: "Объединённые карточки",
  missing: "Нет в каталоге",
  invalid: "Не прошли проверку данных",
  failed: "Сбой при сохранении"
};

export const groupCatalogBulkFailures = (failures: CatalogBulkFailure[]): CatalogBulkFailureGroup[] => (
  groupAdminBulkFailures(catalogBulkFailureReasons, failures)
);

export const countCatalogBulkFailures = (failed: CatalogBulkFailureGroup[]): number => (
  countAdminBulkFailures(failed)
);

export const describeCatalogBulkFailures = (failed: CatalogBulkFailureGroup[]): string => (
  describeAdminBulkFailures(catalogBulkFailureLabels, failed)
);

type AdminIngredientsToolbarState = {
  q?: string;
  category?: IngredientCategory | "all";
  status?: IngredientCatalogStatus | "all";
  sort?: AdminCatalogSortOption;
  page?: number;
  pageSize?: number;
};

export type AdminIngredientsPageParams = {
  q: string;
  category: IngredientCategory | undefined;
  status: IngredientCatalogStatus | undefined;
  sort: AdminCatalogSortOption;
  page: number;
  pageSize: number;
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

export const parseIngredientCatalogCategory = (
  value: string | undefined
): IngredientCategory | undefined => (
  ingredientCategories.includes(value as IngredientCategory)
    ? value as IngredientCategory
    : undefined
);

export const parseAdminCatalogPage = (value: string | undefined): number => {
  const parsed = Number(value ?? "1");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
};

export const parseAdminCatalogPageSize = (value: string | undefined): number => {
  const parsed = Number(value ?? "");
  return (adminCatalogPageSizeOptions as readonly number[]).includes(parsed)
    ? parsed
    : defaultAdminCatalogPageSize;
};

const readParam = (value: string | string[] | undefined): string | undefined => (
  typeof value === "string" ? value : undefined
);

export const parseAdminIngredientsPageParams = (
  params: Record<string, string | string[] | undefined>
): AdminIngredientsPageParams => ({
  q: (readParam(params.q) ?? "").trim(),
  category: parseIngredientCatalogCategory(readParam(params.category)),
  status: parseIngredientCatalogStatus(readParam(params.status)),
  sort: parseAdminCatalogSort(readParam(params.sort)),
  page: parseAdminCatalogPage(readParam(params.page)),
  pageSize: parseAdminCatalogPageSize(readParam(params.pageSize))
});

export const buildAdminIngredientsHref = (
  pathname: string,
  {
    q = "",
    category = "all",
    status = "all",
    sort = defaultAdminCatalogSortOption,
    page = 1,
    pageSize = defaultAdminCatalogPageSize
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

  if (pageSize !== defaultAdminCatalogPageSize) {
    params.set("pageSize", String(pageSize));
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
};

export const buildIngredientAliasesPreview = (
  aliases: IngredientCatalogItemDto["aliases"],
  limit = 4
): string | null => {
  if (aliases.length === 0) {
    return null;
  }

  const preview = aliases.slice(0, limit).map((alias) => alias.alias).join(", ");
  const rest = aliases.length - limit;
  return rest > 0 ? `${preview} +${rest}` : preview;
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
