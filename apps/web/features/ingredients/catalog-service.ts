import {
  and,
  db,
  eq,
  inArray,
  isNull,
  recipeIngredients,
  recipes,
  sql,
  userCustomIngredients,
  userIngredients
} from "@nb/db";

import type {
  IngredientAliasDto,
  IngredientCatalogSortOption,
  IngredientCategory,
  IngredientManufacturerRefinement,
  IngredientSearchResult,
  IngredientSuggestionItem,
  IngredientType,
  UserCatalogIngredientDto,
  UserCatalogListResult
} from "./contracts";
import {
  ingredientCategories,
  ingredientCatalogSortOptions,
  ingredientManufacturerRefinementLimit,
  ingredientSearchQuerySchema
} from "./contracts";
import { ingredientSearchSimpleModeThreshold } from "./contracts";
import { sortRankedCatalogItems } from "./catalog-ranking";
import { readCustomIngredientMetadata } from "./custom-metadata";
import { normalizeSearchText } from "./normalization";
import {
  buildIngredientTypedSummary,
  resolveIngredientBrandLabel,
  resolveIngredientDisplayNames
} from "./presentation";
import { loadIngredients, getIngredientById } from "./service";
import {
  extractIngredientTechnicalData,
  extractIngredientTechnicalFields
} from "./technical-fields";
import {
  resolveIngredientCategory,
  resolveIngredientSubtype,
  type IngredientSubtype
} from "./taxonomy";
import { rankIngredientCandidate } from "./ranking";
import {
  applyFavoriteStateToCatalogItems,
  listIngredientPurchaseLinksByReference
} from "./user-metadata-service";
import { resolveHumanFacingInventoryUnitProfile } from "../inventory/units";

type CatalogSearchParams = {
  q: string;
  type?: string;
  category?: string;
  subtype?: string;
  manufacturer?: string;
  limit?: number;
  includeCustom?: boolean;
};

type CatalogListParams = {
  view?: "all" | "mine";
  page?: number;
  pageSize?: number;
  q?: string;
  category?: IngredientCategory;
  subtype?: "malt" | "fermentable";
  sort?: IngredientCatalogSortOption;
};

type RankedCatalogItem = {
  item: UserCatalogIngredientDto;
  tier: number;
  score: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object"
  && value !== null
  && !Array.isArray(value)
);

const readTrimmedString = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const buildCustomAliasDto = (aliases: ReturnType<typeof readCustomIngredientMetadata>["aliases"]): IngredientAliasDto[] => (
  aliases.map((alias, index) => ({
    id: `custom-alias-${index}-${alias.aliasNormalized}`,
    locale: alias.locale,
    alias: alias.alias,
    aliasNormalized: alias.aliasNormalized,
    source: alias.source,
    isEnabled: alias.isEnabled
  }))
);

const mapSystemIngredient = (item: Awaited<ReturnType<typeof loadIngredients>>[number]): UserCatalogIngredientDto => ({
  ...item,
  source: "catalog",
  notes: null,
  properties: null,
  derivedFromIngredientId: null,
  derivedFromDisplayName: null,
  inventoryUsageCount: 0,
  recipeUsageCount: 0,
  inventoryInUse: false,
  recipeInUse: false
});

const mapCustomIngredient = (
  item: typeof userCustomIngredients.$inferSelect
): UserCatalogIngredientDto => {
  const metadata = readCustomIngredientMetadata(item);
  const technicalData = extractIngredientTechnicalData({
    type: item.type,
    technicalData: metadata.technicalData ?? undefined,
    properties: item.properties,
    hopAlphaAcidPct: item.hopAlphaAcidPct,
    hopForm: item.hopForm,
    fermentableExtractYieldPct: item.fermentableExtractYieldPct,
    fermentableColorEbc: item.fermentableColorEbc,
    yeastAttenuationPct: item.yeastAttenuationPct,
    yeastForm: item.yeastForm,
    yeastMinFermentationTempC: item.yeastMinFermentationTempC,
    yeastMaxFermentationTempC: item.yeastMaxFermentationTempC
  });
  const type = item.type as IngredientType;
  const category = resolveIngredientCategory({ type, category: metadata.category });
  const subtype = resolveIngredientSubtype({ type, category, subtype: metadata.subtype }) as IngredientSubtype | null;
  const unitPreferred = technicalData?.type === "water_treatment" && typeof technicalData.unitPreferred === "string"
    ? technicalData.unitPreferred
    : null;
  const unitProfile = resolveHumanFacingInventoryUnitProfile({
    type,
    category,
    subtype,
    defaultDisplayUnit: metadata.defaultDisplayUnit,
    allowedUnits: metadata.allowedUnits,
    measurementDimension: metadata.measurementDimension,
    technicalData,
    unitPreferred
  });
  const { primaryName, secondaryName } = resolveIngredientDisplayNames({
    displayName: item.displayName,
    countryName: item.country ?? readTrimmedString(metadata.properties.country),
    nameRu: metadata.nameRu,
    nameEn: metadata.nameEn,
    displayModeRu: metadata.displayModeRu,
    displayNameOverrideRu: metadata.displayNameOverrideRu,
    secondaryNameOverrideRu: metadata.secondaryNameOverrideRu,
    hideSecondaryNameRu: metadata.hideSecondaryNameRu
  });
  const properties = metadata.properties;
  const brand = item.manufacturer
    ?? readTrimmedString(properties.brand)
    ?? null;
  const country = item.country ?? readTrimmedString(properties.country);

  return {
    id: item.id,
    source: "custom",
    type,
    category,
    subtype,
    familyId: null,
    primaryLabelRu: primaryName,
    secondaryLabelRu: secondaryName ?? null,
    displayName: primaryName,
    displayNameRu: metadata.nameRu,
    displayNameEn: metadata.nameEn,
    nameRu: metadata.nameRu,
    nameEn: metadata.nameEn,
    displayModeRu: metadata.displayModeRu,
    displayNameOverrideRu: metadata.displayNameOverrideRu,
    secondaryNameOverrideRu: metadata.secondaryNameOverrideRu,
    hideSecondaryNameRu: metadata.hideSecondaryNameRu,
    brand,
    producer: brand,
    brandName: brand,
    manufacturer: brand,
    country,
    countryCode: null,
    countryName: country,
    productCode: metadata.productCode,
    aliases: buildCustomAliasDto(metadata.aliases),
    sources: [],
    packageVariants: [],
    notes: metadata.notes,
    technicalData,
    properties,
    defaultUnit: unitProfile.defaultUnit,
    defaultDisplayUnit: unitProfile.defaultUnit,
    allowedUnits: unitProfile.allowedUnits,
    measurementDimension: unitProfile.measurementDimension,
    completenessLevel: null,
    quantityDefaults: isRecord(properties.quantityDefaults)
      ? properties.quantityDefaults
      : null,
    unitPreferred,
    derivedFromIngredientId: metadata.derivedFromIngredientId,
    derivedFromDisplayName: metadata.derivedFromDisplayName,
    inventoryUsageCount: 0,
    recipeUsageCount: 0,
    inventoryInUse: false,
    recipeInUse: false,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    ...extractIngredientTechnicalFields({
      type,
      technicalData
    })
  };
};

const loadCustomIngredients = async (userId: string): Promise<UserCatalogIngredientDto[]> => {
  const rows = await db.query.userCustomIngredients.findMany({
    where: eq(userCustomIngredients.userId, userId)
  });

  return rows.map(mapCustomIngredient);
};

const buildSearchText = (item: UserCatalogIngredientDto) => {
  const aliases = item.aliases.map((alias) => alias.aliasNormalized);
  const variantNames = item.packageVariants.flatMap((variant) => [variant.brand, variant.productNameRu]).filter(Boolean);

  return normalizeSearchText([
    item.primaryLabelRu,
    item.secondaryLabelRu,
    item.displayName,
    item.nameRu,
    item.nameEn,
    item.brand,
    item.producer,
    item.manufacturer,
    item.productCode,
    item.subtype,
    ...aliases,
    ...variantNames
  ].filter(Boolean).join(" "));
};

export const toIngredientSuggestionItem = (
  item: UserCatalogIngredientDto,
  score?: number
): IngredientSuggestionItem => ({
  id: item.id,
  type: item.type,
  category: item.category,
  subtype: item.subtype,
  familyId: item.familyId,
  primaryLabelRu: item.primaryLabelRu,
  secondaryLabelRu: item.secondaryLabelRu,
  displayName: item.displayName,
  displayNameRu: item.displayNameRu,
  displayNameEn: item.displayNameEn,
  nameRu: item.nameRu,
  nameEn: item.nameEn,
  displayModeRu: item.displayModeRu,
  subtitle: [
    item.brand ?? item.producer ?? null,
    item.countryName ?? null,
    buildIngredientTypedSummary({
      type: item.type,
      category: item.category,
      subtype: item.subtype,
      technicalData: item.technicalData,
      unitPreferred: item.unitPreferred
    }) ?? null
  ].filter(Boolean).join(" • ") || undefined,
  brand: item.brand,
  producer: item.producer,
  brandName: item.brandName,
  manufacturer: item.manufacturer,
  countryCode: item.countryCode ?? undefined,
  countryName: item.countryName ?? undefined,
  country: item.country ?? undefined,
  productCode: item.productCode ?? undefined,
  technicalData: item.technicalData,
  defaultUnit: item.defaultUnit,
  defaultDisplayUnit: item.defaultDisplayUnit,
  allowedUnits: item.allowedUnits,
  measurementDimension: item.measurementDimension,
  completenessLevel: item.completenessLevel ?? undefined,
  quantityDefaults: item.quantityDefaults,
  unitPreferred: item.unitPreferred,
  packageVariants: item.packageVariants,
  familyDisplayName: null,
  familyCanonicalName: null,
  score,
  derivedFromIngredientId: item.derivedFromIngredientId,
  derivedFromDisplayName: item.derivedFromDisplayName,
  isFavorite: item.isFavorite ?? false,
  source: item.source
});

const resolveManufacturerLabel = (item: Pick<UserCatalogIngredientDto, "brand" | "producer" | "brandName" | "manufacturer">) => (
  resolveIngredientBrandLabel(item)
);

const filterItemsByManufacturer = (
  items: UserCatalogIngredientDto[],
  manufacturer?: string
) => {
  if (!manufacturer) {
    return items;
  }

  const normalizedManufacturer = normalizeSearchText(manufacturer);
  if (!normalizedManufacturer) {
    return items;
  }

  return items.filter((item) => normalizeSearchText(resolveManufacturerLabel(item) ?? "") === normalizedManufacturer);
};

const buildManufacturerRefinements = (
  rankedItems: RankedCatalogItem[],
  activeManufacturer?: string
): IngredientManufacturerRefinement[] => {
  const normalizedActiveManufacturer = normalizeSearchText(activeManufacturer ?? "");
  const grouped = new Map<string, IngredientManufacturerRefinement>();

  for (const rankedItem of rankedItems) {
    const label = resolveManufacturerLabel(rankedItem.item);
    const normalizedLabel = normalizeSearchText(label ?? "");
    if (!label || !normalizedLabel || normalizedLabel === normalizedActiveManufacturer) {
      continue;
    }

    const current = grouped.get(normalizedLabel);
    if (current) {
      current.count += 1;
      current.score = Math.max(current.score, rankedItem.score);
      continue;
    }

    grouped.set(normalizedLabel, {
      type: "manufacturer",
      label,
      normalizedLabel,
      count: 1,
      score: rankedItem.score
    });
  }

  return [...grouped.values()]
    .sort((left, right) => (
      right.score - left.score
      || right.count - left.count
      || left.label.localeCompare(right.label, "ru")
    ))
    .slice(0, ingredientManufacturerRefinementLimit);
};

const buildBrandMarketCountMap = (items: UserCatalogIngredientDto[]) => {
  const counts = new Map<string, number>();

  for (const item of items) {
    const normalizedBrand = normalizeSearchText(resolveManufacturerLabel(item) ?? "");
    if (!normalizedBrand) {
      continue;
    }

    counts.set(normalizedBrand, (counts.get(normalizedBrand) ?? 0) + 1);
  }

  return counts;
};

const buildRankedItem = (
  item: UserCatalogIngredientDto,
  query: string,
  brandMarketCounts?: Map<string, number>
): RankedCatalogItem | null => {
  const normalizedBrand = normalizeSearchText(resolveManufacturerLabel(item) ?? "");
  const rank = rankIngredientCandidate(query, {
    displayName: item.displayName,
    displayNameRu: item.nameRu ?? item.displayNameRu,
    displayNameEn: item.nameEn ?? item.displayNameEn,
    nameRu: item.nameRu,
    nameEn: item.nameEn,
    aliases: item.aliases.map((alias) => ({
      alias: alias.alias,
      aliasNormalized: alias.aliasNormalized,
      isEnabled: alias.isEnabled
    })),
    searchTextNorm: buildSearchText(item),
    brandName: item.brand ?? item.brandName,
    manufacturer: item.producer ?? item.manufacturer,
    productCode: item.productCode,
    isFavorite: item.isFavorite,
    source: item.source,
    inventoryUsageCount: item.inventoryUsageCount,
    recipeUsageCount: item.recipeUsageCount,
    brandMarketCount: normalizedBrand ? brandMarketCounts?.get(normalizedBrand) ?? 0 : 0,
    sourcesCount: item.sources.length,
    packageVariantsCount: item.packageVariants.length,
    packageVariants: item.packageVariants.map((variant) => ({
      id: variant.id,
      brand: variant.brand,
      productNameRu: variant.productNameRu
    }))
  });

  if (!rank || rank.score <= 0) {
    return null;
  }

  return {
    item,
    tier: rank.tier,
    score: rank.score
  };
};

const applyUsageCounts = async (
  userId: string,
  items: UserCatalogIngredientDto[]
): Promise<UserCatalogIngredientDto[]> => {
  const catalogIds = items.filter((item) => item.source === "catalog").map((item) => item.id);
  const customIds = items.filter((item) => item.source === "custom").map((item) => item.id);

  const [inventoryCatalogCounts, inventoryCustomCounts, recipeCatalogCounts, recipeCustomCounts] = await Promise.all([
    catalogIds.length
      ? db.select({
        ingredientId: userIngredients.ingredientCatalogItemId,
        count: sql<number>`count(*)::int`
      }).from(userIngredients)
        .where(and(
          eq(userIngredients.userId, userId),
          isNull(userIngredients.archivedAt),
          inArray(userIngredients.ingredientCatalogItemId, catalogIds)
        ))
        .groupBy(userIngredients.ingredientCatalogItemId)
      : Promise.resolve([]),
    customIds.length
      ? db.select({
        ingredientId: userIngredients.userCustomIngredientId,
        count: sql<number>`count(*)::int`
      }).from(userIngredients)
        .where(and(
          eq(userIngredients.userId, userId),
          isNull(userIngredients.archivedAt),
          inArray(userIngredients.userCustomIngredientId, customIds)
        ))
        .groupBy(userIngredients.userCustomIngredientId)
      : Promise.resolve([]),
    catalogIds.length
      ? db.select({
        ingredientId: recipeIngredients.ingredientCatalogItemId,
        count: sql<number>`count(*)::int`
      }).from(recipeIngredients)
        .innerJoin(recipes, eq(recipeIngredients.recipeId, recipes.id))
        .where(and(
          eq(recipes.authorId, userId),
          inArray(recipeIngredients.ingredientCatalogItemId, catalogIds)
        ))
        .groupBy(recipeIngredients.ingredientCatalogItemId)
      : Promise.resolve([]),
    customIds.length
      ? db.select({
        ingredientId: recipeIngredients.userCustomIngredientId,
        count: sql<number>`count(*)::int`
      }).from(recipeIngredients)
        .innerJoin(recipes, eq(recipeIngredients.recipeId, recipes.id))
        .where(and(
          eq(recipes.authorId, userId),
          inArray(recipeIngredients.userCustomIngredientId, customIds)
        ))
        .groupBy(recipeIngredients.userCustomIngredientId)
      : Promise.resolve([])
  ]);

  const inventoryCatalogMap = new Map(inventoryCatalogCounts.map((row) => [row.ingredientId ?? "", row.count]));
  const inventoryCustomMap = new Map(inventoryCustomCounts.map((row) => [row.ingredientId ?? "", row.count]));
  const recipeCatalogMap = new Map(recipeCatalogCounts.map((row) => [row.ingredientId ?? "", row.count]));
  const recipeCustomMap = new Map(recipeCustomCounts.map((row) => [row.ingredientId ?? "", row.count]));

  return items.map((item) => {
    const inventoryUsageCount = item.source === "custom"
      ? inventoryCustomMap.get(item.id) ?? 0
      : inventoryCatalogMap.get(item.id) ?? 0;
    const recipeUsageCount = item.source === "custom"
      ? recipeCustomMap.get(item.id) ?? 0
      : recipeCatalogMap.get(item.id) ?? 0;

    return {
      ...item,
      inventoryUsageCount,
      recipeUsageCount,
      inventoryInUse: inventoryUsageCount > 0,
      recipeInUse: recipeUsageCount > 0
    };
  });
};

const sortCatalogItems = (
  items: UserCatalogIngredientDto[],
  sort: IngredientCatalogSortOption
) => items.slice().sort((left, right) => {
  if (sort === "updated") {
    return right.updatedAt.getTime() - left.updatedAt.getTime()
      || left.primaryLabelRu.localeCompare(right.primaryLabelRu, "ru");
  }

  if (sort === "category") {
    return ingredientCategories.indexOf(left.category) - ingredientCategories.indexOf(right.category)
      || left.primaryLabelRu.localeCompare(right.primaryLabelRu, "ru");
  }

  if (sort === "brand") {
    return (left.brand ?? left.producer ?? "").localeCompare(right.brand ?? right.producer ?? "", "ru")
      || left.primaryLabelRu.localeCompare(right.primaryLabelRu, "ru");
  }

  return left.primaryLabelRu.localeCompare(right.primaryLabelRu, "ru");
});

const loadUnifiedCatalogItems = async (
  userId: string,
  params?: { type?: string }
) => {
  const [catalogItems, customItems] = await Promise.all([
    loadIngredients({
      type: params?.type
    }),
    loadCustomIngredients(userId)
  ]);

  const mappedCatalogItems = catalogItems.map(mapSystemIngredient);
  const filteredCustomItems = customItems.filter((item) => (
    !params?.type || item.type === params.type
  ));

  const allItems = await applyFavoriteStateToCatalogItems(userId, [
    ...filteredCustomItems,
    ...mappedCatalogItems
  ]);

  return {
    catalogItems: allItems.filter((item) => item.source === "catalog"),
    customItems: allItems.filter((item) => item.source === "custom"),
    allItems
  };
};

export const searchUserCatalogIngredients = async (
  userId: string,
  params: CatalogSearchParams
): Promise<IngredientSearchResult> => {
  const query = ingredientSearchQuerySchema.parse(params);
  const { allItems, catalogItems } = await loadUnifiedCatalogItems(userId, {
    type: query.type
  });
  const categoryFilteredCatalogItems = query.category
    ? catalogItems.filter((item) => item.category === query.category)
    : catalogItems;
  const categoryFilteredAllItems = query.category
    ? allItems.filter((item) => item.category === query.category)
    : allItems;
  const subtypeFilteredCatalogItems = query.subtype
    ? categoryFilteredCatalogItems.filter((item) => item.subtype === query.subtype)
    : categoryFilteredCatalogItems;
  const subtypeFilteredAllItems = query.subtype
    ? categoryFilteredAllItems.filter((item) => item.subtype === query.subtype)
    : categoryFilteredAllItems;
  const searchableItems = params.includeCustom === false ? subtypeFilteredCatalogItems : subtypeFilteredAllItems;
  const manufacturerScopedItems = filterItemsByManufacturer(searchableItems, query.manufacturer);
  const brandMarketCounts = buildBrandMarketCountMap(manufacturerScopedItems);
  const rankedItems = manufacturerScopedItems
    .map((item) => buildRankedItem(item, query.q, brandMarketCounts))
    .filter((item): item is RankedCatalogItem => item !== null)
    .sort(sortRankedCatalogItems);
  const refinements = buildManufacturerRefinements(rankedItems, query.manufacturer);
  const total = rankedItems.length;
  const items = rankedItems
    .slice(0, query.limit)
    .map(({ item, score }) => toIngredientSuggestionItem(item, score));
  const normalizedManufacturer = normalizeSearchText(query.manufacturer ?? "");
  const appliedManufacturer = normalizedManufacturer
    ? refinements.find((refinement) => refinement.normalizedLabel === normalizedManufacturer)
      ?? {
        type: "manufacturer" as const,
        label: query.manufacturer ?? "",
        normalizedLabel: normalizedManufacturer,
        count: total,
        score: rankedItems[0]?.score ?? 0
      }
    : null;

  return {
    items,
    refinements: query.manufacturer ? [] : refinements,
    total,
    isBroadMatch: total > ingredientSearchSimpleModeThreshold,
    hasMore: total > items.length,
    appliedManufacturer
  };
};

export const getIngredientSuggestionByRef = async (
  userId: string,
  source: "catalog" | "custom",
  id: string
): Promise<IngredientSuggestionItem | null> => {
  const item = await getUserCatalogIngredientByRef(userId, source, id);
  if (!item) {
    return null;
  }

  return toIngredientSuggestionItem(item);
};

export const listUserCatalogIngredients = async (
  userId: string,
  params: CatalogListParams = {}
): Promise<UserCatalogListResult> => {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, params.pageSize ?? 20));
  const sort = ingredientCatalogSortOptions.includes(params.sort as IngredientCatalogSortOption)
    ? params.sort as IngredientCatalogSortOption
    : "name";
  const view = params.view === "mine" ? "mine" : "all";
  const { catalogItems, customItems, allItems } = await loadUnifiedCatalogItems(userId);

  const rankItems = (items: UserCatalogIngredientDto[]) => (
    params.q?.trim()
      ? (() => {
        const brandMarketCounts = buildBrandMarketCountMap(items);

        return items
          .map((item) => buildRankedItem(item, params.q ?? "", brandMarketCounts))
          .filter((item): item is RankedCatalogItem => item !== null)
          .sort(sortRankedCatalogItems)
          .map(({ item }) => item);
      })()
      : sortCatalogItems(items, sort)
  );

  const rankedAllItems = rankItems(allItems);
  const rankedCustomItems = rankItems(customItems);
  const baseItems = view === "mine" ? rankedCustomItems : rankedAllItems;
  const filteredByCategory = params.category
    ? baseItems.filter((item) => item.category === params.category)
    : baseItems;
  const filtered = params.subtype
    ? filteredByCategory.filter((item) => item.category === "fermentable" && item.subtype === params.subtype)
    : filteredByCategory;

  const countByCategory = (items: UserCatalogIngredientDto[]) => ({
    fermentable: items.filter((item) => item.category === "fermentable").length,
    hop: items.filter((item) => item.category === "hop").length,
    yeast: items.filter((item) => item.category === "yeast").length,
    consumable: items.filter((item) => item.category === "consumable").length,
    water_treatment: items.filter((item) => item.category === "water_treatment").length
  });
  const countFermentableSubtypes = (items: UserCatalogIngredientDto[]) => ({
    malt: items.filter((item) => item.category === "fermentable" && item.subtype === "malt").length,
    fermentable: items.filter((item) => item.category === "fermentable" && item.subtype === "fermentable").length
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pagedItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  const hydratedItems = await applyUsageCounts(userId, pagedItems);

  return {
    items: hydratedItems,
    page,
    pageSize,
    total,
    totalPages,
    facets: {
      byCategory: countByCategory(baseItems),
      filteredByCategory: countByCategory(filtered),
      byFermentableSubtype: countFermentableSubtypes(baseItems),
      customCount: rankedAllItems.filter((item) => item.source === "custom").length,
      catalogCount: rankedAllItems.filter((item) => item.source === "catalog").length
    }
  };
};

export const getUserCatalogIngredientByRef = async (
  userId: string,
  source: "catalog" | "custom",
  id: string
): Promise<UserCatalogIngredientDto | null> => {
  let item: UserCatalogIngredientDto | null = null;

  if (source === "catalog") {
    const systemItem = await getIngredientById(id);
    item = systemItem ? mapSystemIngredient(systemItem) : null;
  } else {
    const customItem = await db.query.userCustomIngredients.findFirst({
      where: and(
        eq(userCustomIngredients.id, id),
        eq(userCustomIngredients.userId, userId)
      )
    });
    item = customItem ? mapCustomIngredient(customItem) : null;
  }

  if (!item) {
    return null;
  }

  const [hydrated] = await applyUsageCounts(userId, [item]);
  if (!hydrated) {
    return null;
  }

  const [favorited] = await applyFavoriteStateToCatalogItems(userId, [hydrated]);
  if (!favorited) {
    return null;
  }

  let result = favorited;

  if (result.source === "custom" && result.derivedFromIngredientId && !result.derivedFromDisplayName) {
    const baseItem = await getIngredientById(result.derivedFromIngredientId);
    if (baseItem) {
      result = {
        ...result,
        derivedFromDisplayName: baseItem.primaryLabelRu
      };
    }
  }

  const purchaseLinks = await listIngredientPurchaseLinksByReference(userId, {
    source: result.source,
    id: result.id
  });

  return {
    ...result,
    purchaseLinks
  };
};
