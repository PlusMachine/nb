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
  IngredientConsumableGroupRefinement,
  IngredientPickerQuickStartAvailability,
  IngredientPickerQuickStartAvailabilityByContext,
  IngredientPickerQuickStartAvailabilityBySubtype,
  IngredientSearchFamilyScope,
  IngredientPickerQuickStartResult,
  IngredientPickerQuickStartResultByContext,
  IngredientPickerQuickStartResultBySubtype,
  IngredientManufacturerRefinement,
  IngredientSearchRefinement,
  IngredientSearchResult,
  IngredientSuggestionItem,
  IngredientType,
  UserIngredientReference,
  UserCatalogIngredientDto,
  UserCatalogListResult
} from "./contracts";
import {
  ingredientCategories,
  ingredientCatalogSortOptions,
  ingredientManufacturerRefinementLimit,
  ingredientPickerQuickStartQuerySchema,
  ingredientSearchQuerySchema
} from "./contracts";
import { ingredientSearchSimpleModeThreshold } from "./contracts";
import { sortRankedCatalogItems } from "./catalog-ranking";
import { readCustomIngredientMetadata } from "./custom-metadata";
import { normalizeSearchText } from "./normalization";
import {
  canonicalizeWaterTreatmentQuickStartGroup,
  ingredientPickerConsumableQuickStartFallbackGroups,
  canonicalizeFermentableQuickStartGroup,
  ingredientPickerFermentableQuickStartFallbackGroups,
  ingredientPickerFermentableQuickStartGroupOrder,
  ingredientPickerMaltQuickStartFallbackBrands,
  ingredientPickerQuickStartBrandLimit,
  ingredientPickerWaterTreatmentQuickStartFallbackGroups,
  resolveFermentableQuickStartGroupLabel,
  resolveIngredientPickerQuickStartGroupDisplayLimit,
  resolveIngredientPickerQuickStartBrandLabel,
  resolveIngredientPickerQuickStartFamilyScope,
  resolveWaterTreatmentQuickStartGroup,
  resolveWaterTreatmentQuickStartGroupLabel
} from "./picker-quick-start";
import {
  buildIngredientTypedSummary,
  resolveIngredientBrandLabel,
  resolveIngredientDisplayNames
} from "./presentation";
import {
  buildConsumablePackageSearchLabels,
  canonicalizeConsumablePickerGroup,
  consumablePickerGroupOrder,
  resolveConsumablePickerGroup,
  resolveConsumablePickerGroupDescription,
  resolveConsumablePickerGroupLabel,
  resolveConsumablePriorityTerms,
  resolveConsumableTechnicalData
} from "./consumables";
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
import { matchesIngredientFamilyScope, rankIngredientCandidate } from "./ranking";
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
  family?: string;
  group?: string;
  manufacturer?: string;
  favoritesOnly?: boolean;
  customOnly?: boolean;
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
  const groupName = readTrimmedString(properties.groupName)
    ?? readTrimmedString(properties.group)
    ?? null;
  const sourceCategory = readTrimmedString(properties.sourceCategory)
    ?? ((category === "consumable" || category === "water_treatment")
      ? readTrimmedString(properties.pickerGroup) ?? readTrimmedString(properties.subtype)
      : null);
  const subcategory = readTrimmedString(properties.subcategory);
  const itemKind = readTrimmedString(properties.itemKind) ?? subtype;

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
    groupName,
    sourceCategory,
    subcategory,
    itemKind,
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
  const variantNames = item.packageVariants.flatMap((variant) => buildConsumablePackageSearchLabels(variant));
  const consumable = resolveConsumableTechnicalData(item.technicalData);

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
    item.groupName,
    item.sourceCategory,
    item.subcategory,
    item.subtype,
    ...aliases,
    ...variantNames,
    ...(consumable?.marketNamesRu ?? []),
    ...(consumable?.marketNamesEn ?? []),
    ...(resolveConsumablePriorityTerms(item.technicalData)),
    consumable?.pickerFunctionRu,
    consumable?.pickerUsageRu
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
  itemKind: item.itemKind,
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
  groupName: item.groupName ?? undefined,
  sourceCategory: item.sourceCategory ?? undefined,
  subcategory: item.subcategory ?? undefined,
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

const filterItemsByFavoriteState = (
  items: UserCatalogIngredientDto[],
  favoritesOnly = false
) => (
  favoritesOnly
    ? items.filter((item) => item.isFavorite === true)
    : items
);

const filterItemsByCustomState = (
  items: UserCatalogIngredientDto[],
  customOnly = false
) => (
  customOnly
    ? items.filter((item) => item.source === "custom")
    : items
);

const resolveIngredientGroupValue = (item: UserCatalogIngredientDto) => {
  if (item.category === "consumable") {
    return resolveConsumablePickerGroup({
      technicalData: item.technicalData,
      sourceCategory: item.sourceCategory,
      subcategory: item.subcategory,
      groupName: item.groupName,
      subtype: item.subtype,
      itemKind: item.itemKind
    });
  }

  if (item.category === "water_treatment") {
    return resolveWaterTreatmentQuickStartGroup({
      technicalData: item.technicalData,
      sourceCategory: item.sourceCategory,
      subcategory: item.subcategory,
      subtype: item.subtype,
      groupName: item.groupName,
      itemKind: item.itemKind
    });
  }

  if (item.category === "fermentable" && item.subtype === "fermentable") {
    return canonicalizeFermentableQuickStartGroup(item.groupName);
  }

  return null;
};

const resolveIngredientGroupLabel = (
  category: IngredientCategory | undefined,
  group?: string | null
) => {
  if (!group) {
    return null;
  }

  if (category === "consumable") {
    return resolveConsumablePickerGroupLabel(group) ?? group;
  }

  if (category === "water_treatment") {
    return resolveWaterTreatmentQuickStartGroupLabel(group) ?? group;
  }

  if (category === "fermentable") {
    return resolveFermentableQuickStartGroupLabel(group) ?? group;
  }

  return group;
};

const resolveIngredientGroupDescription = (
  category: IngredientCategory | undefined,
  group?: string | null
) => (
  category === "consumable"
    ? resolveConsumablePickerGroupDescription(group)
    : null
);

const filterItemsByGroup = (
  items: UserCatalogIngredientDto[],
  category: IngredientCategory | undefined,
  group?: string
) => {
  const normalizedGroup = normalizeSearchText(group ?? "");
  if (!normalizedGroup) {
    return items;
  }

  return items.filter((item) => (
    item.category === category
    && normalizeSearchText(resolveIngredientGroupValue(item) ?? "") === normalizedGroup
  ));
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
      value: label,
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

const buildConsumableGroupRefinements = (
  rankedItems: RankedCatalogItem[],
  activeGroup?: string
): IngredientConsumableGroupRefinement[] => {
  const normalizedActiveGroup = normalizeSearchText(activeGroup ?? "");
  const grouped = new Map<string, IngredientConsumableGroupRefinement>();

  for (const rankedItem of rankedItems) {
    const value = resolveConsumablePickerGroup({
      technicalData: rankedItem.item.technicalData,
      sourceCategory: rankedItem.item.sourceCategory,
      subcategory: rankedItem.item.subcategory,
      groupName: rankedItem.item.groupName,
      subtype: rankedItem.item.subtype,
      itemKind: rankedItem.item.itemKind
    });
    const normalizedValue = normalizeSearchText(value ?? "");
    if (!value || !normalizedValue || normalizedValue === normalizedActiveGroup) {
      continue;
    }

    const label = resolveConsumablePickerGroupLabel(value) ?? value;
    const current = grouped.get(normalizedValue);
    if (current) {
      current.count += 1;
      current.score = Math.max(current.score, rankedItem.score);
      continue;
    }

    grouped.set(normalizedValue, {
      type: "consumable_group",
      label,
      normalizedLabel: normalizedValue,
      value,
      count: 1,
      score: rankedItem.score,
      description: resolveConsumablePickerGroupDescription(value)
    });
  }

  const groupOrder = new Map<string, number>(consumablePickerGroupOrder.map((value, index) => [value, index]));

  return [...grouped.values()].sort((left, right) => (
    (groupOrder.get(left.value) ?? Number.MAX_SAFE_INTEGER) - (groupOrder.get(right.value) ?? Number.MAX_SAFE_INTEGER)
    || right.count - left.count
    || right.score - left.score
    || left.label.localeCompare(right.label, "ru")
  ));
};

const buildFermentableGroupRefinements = (
  rankedItems: RankedCatalogItem[],
  activeGroup?: string
): IngredientConsumableGroupRefinement[] => {
  const normalizedActiveGroup = normalizeSearchText(canonicalizeFermentableQuickStartGroup(activeGroup) ?? "");
  const grouped = new Map<string, IngredientConsumableGroupRefinement>();

  for (const rankedItem of rankedItems) {
    const value = resolveIngredientGroupValue(rankedItem.item);
    const normalizedValue = normalizeSearchText(value ?? "");
    if (!value || !normalizedValue || normalizedValue === normalizedActiveGroup) {
      continue;
    }

    const label = resolveIngredientGroupLabel("fermentable", value) ?? value;
    const current = grouped.get(normalizedValue);
    if (current) {
      current.count += 1;
      current.score = Math.max(current.score, rankedItem.score);
      continue;
    }

    grouped.set(normalizedValue, {
      type: "consumable_group",
      label,
      normalizedLabel: normalizedValue,
      value,
      count: 1,
      score: rankedItem.score,
      description: null
    });
  }

  const groupOrder = new Map<string, number>(ingredientPickerFermentableQuickStartGroupOrder.map((value, index) => [value, index]));

  return [...grouped.values()].sort((left, right) => (
    (groupOrder.get(left.value) ?? Number.MAX_SAFE_INTEGER) - (groupOrder.get(right.value) ?? Number.MAX_SAFE_INTEGER)
    || right.count - left.count
    || right.score - left.score
    || left.label.localeCompare(right.label, "ru")
  ));
};

const buildWaterTreatmentGroupRefinements = (
  rankedItems: RankedCatalogItem[],
  activeGroup?: string
): IngredientConsumableGroupRefinement[] => {
  const normalizedActiveGroup = normalizeSearchText(canonicalizeWaterTreatmentQuickStartGroup(activeGroup) ?? "");
  const grouped = new Map<string, IngredientConsumableGroupRefinement>();

  for (const rankedItem of rankedItems) {
    const value = resolveIngredientGroupValue(rankedItem.item);
    const normalizedValue = normalizeSearchText(value ?? "");
    if (!value || !normalizedValue || normalizedValue === normalizedActiveGroup) {
      continue;
    }

    const label = resolveIngredientGroupLabel("water_treatment", value) ?? value;
    const current = grouped.get(normalizedValue);
    if (current) {
      current.count += 1;
      current.score = Math.max(current.score, rankedItem.score);
      continue;
    }

    grouped.set(normalizedValue, {
      type: "consumable_group",
      label,
      normalizedLabel: normalizedValue,
      value,
      count: 1,
      score: rankedItem.score,
      description: null
    });
  }

  const groupOrder = new Map<string, number>(ingredientPickerWaterTreatmentQuickStartFallbackGroups.map((group, index) => [group.value, index]));

  return [...grouped.values()].sort((left, right) => (
    (groupOrder.get(left.value) ?? Number.MAX_SAFE_INTEGER) - (groupOrder.get(right.value) ?? Number.MAX_SAFE_INTEGER)
    || right.count - left.count
    || right.score - left.score
    || left.label.localeCompare(right.label, "ru")
  ));
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
    category: item.category,
    sourceCategory: item.sourceCategory,
    aliases: item.aliases.map((alias) => ({
      alias: alias.alias,
      aliasNormalized: alias.aliasNormalized,
      source: alias.source,
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
      productNameEn: variant.productNameEn,
      productNameRu: variant.productNameRu,
      packageAmount: variant.packageAmount,
      packageUnit: variant.packageUnit,
      stockContentAmount: variant.stockContentAmount,
      stockContentUnit: variant.stockContentUnit
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

const filterItemsByPickerContext = (
  items: UserCatalogIngredientDto[],
  category: IngredientCategory,
  subtype?: string | null
) => items.filter((item) => matchesIngredientPickerContext(item, category, subtype));

const matchesIngredientPickerContext = (
  item: {
    category?: IngredientCategory;
    subtype?: IngredientSubtype | null;
  },
  category: IngredientCategory,
  subtype?: string | null
) => {
  if (item.category !== category) {
    return false;
  }

  if (category === "fermentable" && subtype) {
    return item.subtype === subtype;
  }

  return true;
};

export const getIngredientPickerQuickStartAvailability = async (
  userId: string,
  params: {
    category: IngredientCategory;
    subtype?: "malt" | "fermentable" | null;
  }
): Promise<IngredientPickerQuickStartAvailability> => {
  if (!(params.category === "hop"
    || params.category === "yeast"
    || params.category === "water_treatment"
    || params.category === "consumable"
    || (params.category === "fermentable" && (params.subtype === "malt" || params.subtype === "fermentable")))) {
    return {
      hasFavoritesAvailable: false,
      hasCustomAvailable: false
    };
  }

  const { allItems } = await loadUnifiedCatalogItems(userId);
  const scopedItems = filterItemsByPickerContext(allItems, params.category, params.subtype);

  return {
    hasFavoritesAvailable: scopedItems.some((item) => item.isFavorite === true),
    hasCustomAvailable: scopedItems.some((item) => item.source === "custom")
  };
};

export const getIngredientPickerQuickStartAvailabilityBySubtype = async (
  userId: string
): Promise<IngredientPickerQuickStartAvailabilityBySubtype> => {
  const { allItems } = await loadUnifiedCatalogItems(userId);

  const buildAvailability = (
    subtype: Extract<IngredientSubtype, "malt" | "fermentable">
  ): IngredientPickerQuickStartAvailability => {
    const scopedItems = filterItemsByPickerContext(allItems, "fermentable", subtype);

    return {
      hasFavoritesAvailable: scopedItems.some((item) => item.isFavorite === true),
      hasCustomAvailable: scopedItems.some((item) => item.source === "custom")
    };
  };

  return {
    malt: buildAvailability("malt"),
    fermentable: buildAvailability("fermentable")
  };
};

export const getIngredientPickerQuickStartAvailabilityByContext = async (
  userId: string
): Promise<IngredientPickerQuickStartAvailabilityByContext> => {
  const [fermentableAvailability, hopAvailability, yeastAvailability, waterTreatmentAvailability, consumableAvailability] = await Promise.all([
    getIngredientPickerQuickStartAvailabilityBySubtype(userId),
    getIngredientPickerQuickStartAvailability(userId, {
      category: "hop",
      subtype: null
    }),
    getIngredientPickerQuickStartAvailability(userId, {
      category: "yeast",
      subtype: null
    }),
    getIngredientPickerQuickStartAvailability(userId, {
      category: "water_treatment",
      subtype: null
    }),
    getIngredientPickerQuickStartAvailability(userId, {
      category: "consumable",
      subtype: null
    })
  ]);

  return {
    ...fermentableAvailability,
    hop: hopAvailability,
    yeast: yeastAvailability,
    water_treatment: waterTreatmentAvailability,
    consumable: consumableAvailability
  };
};

const filterItemsByQuickStartFamily = (
  items: UserCatalogIngredientDto[],
  family: IngredientSearchFamilyScope | null
) => {
  if (!family) {
    return items;
  }

  return items.filter((item) => matchesIngredientFamilyScope(family.presetQuery, {
    displayName: item.displayName,
    displayNameRu: item.nameRu ?? item.displayNameRu,
    displayNameEn: item.nameEn ?? item.displayNameEn,
    nameRu: item.nameRu,
    nameEn: item.nameEn,
    category: item.category,
    sourceCategory: item.sourceCategory,
    aliases: item.aliases.map((alias) => ({
      alias: alias.alias,
      aliasNormalized: alias.aliasNormalized,
      source: alias.source,
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
    brandMarketCount: 0,
    sourcesCount: item.sources.length,
    packageVariantsCount: item.packageVariants.length,
    packageVariants: item.packageVariants.map((variant) => ({
      id: variant.id,
      brand: variant.brand,
      productNameEn: variant.productNameEn,
      productNameRu: variant.productNameRu,
      packageAmount: variant.packageAmount,
      packageUnit: variant.packageUnit,
      stockContentAmount: variant.stockContentAmount,
      stockContentUnit: variant.stockContentUnit
    }))
  }));
};

const sortQuickStartItems = (items: UserCatalogIngredientDto[]) => items.slice().sort((left, right) => (
  Number(right.isFavorite === true) - Number(left.isFavorite === true)
  || right.inventoryUsageCount - left.inventoryUsageCount
  || right.recipeUsageCount - left.recipeUsageCount
  || right.updatedAt.getTime() - left.updatedAt.getTime()
  || Number(right.source === "custom") - Number(left.source === "custom")
  || left.primaryLabelRu.localeCompare(right.primaryLabelRu, "ru")
));

const buildScopeOnlyRankedItems = (
  items: UserCatalogIngredientDto[]
): RankedCatalogItem[] => sortQuickStartItems(items).map((item, index) => ({
  item,
  tier: 0,
  score: Math.max(1, 1000 - index)
}));

type QuickStartBrandCandidate = IngredientManufacturerRefinement & {
  inventoryUsageCount: number;
  recipeUsageCount: number;
  favoriteCount: number;
  recentCount: number;
  fallbackRank: number | null;
};

type QuickStartGroupCandidate = IngredientConsumableGroupRefinement & {
  inventoryUsageCount: number;
  recipeUsageCount: number;
  favoriteCount: number;
  recentCount: number;
  fallbackRank: number | null;
};

type QuickStartCandidate = QuickStartBrandCandidate | QuickStartGroupCandidate;

const hasQuickStartSignal = (candidate: QuickStartCandidate) => (
  candidate.recentCount > 0
  || candidate.inventoryUsageCount > 0
  || candidate.favoriteCount > 0
  || candidate.recipeUsageCount > 0
);

const sortPersonalizedQuickStartCandidates = (
  left: QuickStartCandidate,
  right: QuickStartCandidate
) => (
  right.recentCount - left.recentCount
  || right.inventoryUsageCount - left.inventoryUsageCount
  || right.favoriteCount - left.favoriteCount
  || right.recipeUsageCount - left.recipeUsageCount
  || ((left.fallbackRank ?? Number.MAX_SAFE_INTEGER) - (right.fallbackRank ?? Number.MAX_SAFE_INTEGER))
  || right.count - left.count
  || left.label.localeCompare(right.label, "ru")
);

const sortRemainingQuickStartCandidates = (
  left: QuickStartCandidate,
  right: QuickStartCandidate
) => (
  ((left.fallbackRank ?? Number.MAX_SAFE_INTEGER) - (right.fallbackRank ?? Number.MAX_SAFE_INTEGER))
  || right.count - left.count
  || right.score - left.score
  || left.label.localeCompare(right.label, "ru")
);

const buildIngredientPickerQuickStartBrands = ({
  items,
  recent,
  fallbackBrands = ingredientPickerMaltQuickStartFallbackBrands
}: {
  items: UserCatalogIngredientDto[];
  recent: IngredientSuggestionItem[];
  fallbackBrands?: IngredientManufacturerRefinement[];
}): IngredientManufacturerRefinement[] => {
  if (items.length === 0) {
    return [];
  }

  const fallbackRanks = new Map(
    fallbackBrands.map((brand, index) => [brand.normalizedLabel, index])
  );
  const recentBrandCounts = new Map<string, number>();

  for (const item of recent) {
    const normalizedBrand = normalizeSearchText(resolveIngredientBrandLabel(item) ?? "");
    if (!normalizedBrand) {
      continue;
    }

    recentBrandCounts.set(normalizedBrand, (recentBrandCounts.get(normalizedBrand) ?? 0) + 1);
  }

  const grouped = new Map<string, QuickStartBrandCandidate>();

  for (const item of items) {
    const label = resolveIngredientPickerQuickStartBrandLabel(resolveManufacturerLabel(item));
    const normalizedLabel = normalizeSearchText(label ?? "");
    if (!label || !normalizedLabel) {
      continue;
    }

    const current = grouped.get(normalizedLabel) ?? {
      type: "manufacturer" as const,
      label,
      normalizedLabel,
      value: label,
      count: 0,
      score: 0,
      inventoryUsageCount: 0,
      recipeUsageCount: 0,
      favoriteCount: 0,
      recentCount: recentBrandCounts.get(normalizedLabel) ?? 0,
      fallbackRank: fallbackRanks.get(normalizedLabel) ?? null
    };

    current.count += 1;
    current.inventoryUsageCount += item.inventoryUsageCount;
    current.recipeUsageCount += item.recipeUsageCount;
    current.favoriteCount += Number(item.isFavorite === true);
    current.score = (
      current.recentCount * 100
      + current.inventoryUsageCount * 40
      + current.favoriteCount * 25
      + current.recipeUsageCount * 10
      + current.count
    );
    grouped.set(normalizedLabel, current);
  }

  const candidates = [...grouped.values()];
  const selected: QuickStartBrandCandidate[] = [];
  const seen = new Set<string>();

  const pushCandidate = (candidate: QuickStartBrandCandidate | undefined) => {
    if (!candidate || seen.has(candidate.normalizedLabel) || selected.length >= ingredientPickerQuickStartBrandLimit) {
      return;
    }

    selected.push(candidate);
    seen.add(candidate.normalizedLabel);
  };

  candidates
    .filter(hasQuickStartSignal)
    .sort(sortPersonalizedQuickStartCandidates)
    .forEach(pushCandidate);

  for (const fallbackBrand of fallbackBrands) {
    pushCandidate(grouped.get(fallbackBrand.normalizedLabel));
  }

  candidates
    .filter((candidate) => !seen.has(candidate.normalizedLabel))
    .sort(sortRemainingQuickStartCandidates)
    .forEach(pushCandidate);

  return selected.map((candidate) => ({
    type: "manufacturer",
    label: candidate.label,
    normalizedLabel: candidate.normalizedLabel,
    value: candidate.value,
    count: candidate.count,
    score: candidate.score
  }));
};

const buildIngredientPickerQuickStartScopedGroups = ({
  items,
  recent,
  category,
  fallbackGroups
}: {
  items: UserCatalogIngredientDto[];
  recent: IngredientSuggestionItem[];
  category: IngredientCategory;
  fallbackGroups: IngredientConsumableGroupRefinement[];
}): IngredientConsumableGroupRefinement[] => {
  const shouldUseFixedGroupOrder = category === "consumable" || category === "water_treatment";

  if (items.length === 0) {
    return fallbackGroups.map((group) => ({
      type: "consumable_group",
      label: group.label,
      normalizedLabel: group.normalizedLabel,
      value: group.value,
      count: 0,
      score: 0,
      description: group.description
    }));
  }

  const maxGroups = Math.max(1, resolveIngredientPickerQuickStartGroupDisplayLimit({
    category
  }));

  const fallbackRanks = new Map(
    fallbackGroups.map((group, index) => [group.value, index])
  );
  const recentGroupCounts = new Map<string, number>();

  for (const item of recent) {
    const normalizedGroup = category === "consumable"
      ? resolveConsumablePickerGroup({
        technicalData: item.technicalData,
        sourceCategory: item.sourceCategory ?? item.groupName ?? null,
        subcategory: item.subcategory ?? null,
        groupName: item.groupName ?? null,
        subtype: item.subtype ?? null,
        itemKind: item.itemKind ?? null
      })
      : category === "water_treatment"
        ? resolveWaterTreatmentQuickStartGroup({
          technicalData: item.technicalData,
          sourceCategory: item.sourceCategory ?? item.groupName ?? null,
          subcategory: item.subcategory ?? null,
          subtype: item.subtype ?? null,
          groupName: item.groupName ?? null,
          itemKind: item.itemKind ?? null
        })
        : canonicalizeFermentableQuickStartGroup(item.groupName);
    if (!normalizedGroup) {
      continue;
    }

    recentGroupCounts.set(normalizedGroup, (recentGroupCounts.get(normalizedGroup) ?? 0) + 1);
  }

  const grouped = new Map<string, QuickStartGroupCandidate>();

  for (const item of items) {
    const value = resolveIngredientGroupValue(item);
    if (!value) {
      continue;
    }

    const label = resolveIngredientGroupLabel(category, value) ?? value;
    const current = grouped.get(value) ?? {
      type: "consumable_group" as const,
      label,
      normalizedLabel: value,
      value,
      count: 0,
      score: 0,
      description: resolveIngredientGroupDescription(category, value),
      inventoryUsageCount: 0,
      recipeUsageCount: 0,
      favoriteCount: 0,
      recentCount: recentGroupCounts.get(value) ?? 0,
      fallbackRank: fallbackRanks.get(value) ?? null
    };

    current.count += 1;
    current.inventoryUsageCount += item.inventoryUsageCount;
    current.recipeUsageCount += item.recipeUsageCount;
    current.favoriteCount += Number(item.isFavorite === true);
    current.score = (
      current.recentCount * 100
      + current.inventoryUsageCount * 40
      + current.favoriteCount * 25
      + current.recipeUsageCount * 10
      + current.count
    );
    grouped.set(value, current);
  }

  if (shouldUseFixedGroupOrder) {
    return fallbackGroups
      .map((fallbackGroup) => {
        const candidate = grouped.get(fallbackGroup.value);
        return {
          type: "consumable_group" as const,
          label: candidate?.label ?? fallbackGroup.label,
          normalizedLabel: candidate?.normalizedLabel ?? fallbackGroup.normalizedLabel,
          value: fallbackGroup.value,
          count: candidate?.count ?? 0,
          score: candidate?.score ?? 0,
          description: candidate?.description ?? fallbackGroup.description
        };
      })
      .slice(0, maxGroups);
  }

  const candidates = [...grouped.values()];
  const selected: QuickStartGroupCandidate[] = [];
  const seen = new Set<string>();

  const pushCandidate = (candidate: QuickStartGroupCandidate | undefined) => {
    if (!candidate || seen.has(candidate.value) || selected.length >= maxGroups) {
      return;
    }

    selected.push(candidate);
    seen.add(candidate.value);
  };

  candidates
    .filter(hasQuickStartSignal)
    .sort(sortPersonalizedQuickStartCandidates)
    .forEach(pushCandidate);

  for (const fallbackGroup of fallbackGroups) {
    pushCandidate(grouped.get(fallbackGroup.value));
  }

  candidates
    .filter((candidate) => !seen.has(candidate.value))
    .sort(sortRemainingQuickStartCandidates)
    .forEach(pushCandidate);

  return selected.map((candidate) => ({
    type: "consumable_group",
    label: candidate.label,
    normalizedLabel: candidate.normalizedLabel,
    value: candidate.value,
    count: candidate.count,
    score: candidate.score,
    description: candidate.description
  }));
};

export const listIngredientPickerQuickStart = async (
  userId: string,
  params: {
    category: IngredientCategory;
    subtype?: "malt" | "fermentable" | null;
    recentReferences?: UserIngredientReference[];
    recentLimit?: number;
  }
): Promise<IngredientPickerQuickStartResult> => {
  const query = ingredientPickerQuickStartQuerySchema.parse(params);
  if (!(query.category === "hop"
    || query.category === "yeast"
    || query.category === "water_treatment"
    || query.category === "consumable"
    || (query.category === "fermentable" && (query.subtype === "malt" || query.subtype === "fermentable")))) {
    return {
      brands: [],
      groups: [],
      recent: [],
      hasFavoritesAvailable: false,
      hasCustomAvailable: false
    };
  }

  const recentHydratedItems = await Promise.all(query.recentReferences.map((reference) => (
    getIngredientSuggestionByRef(userId, reference.source, reference.id)
  )));
  const recent = recentHydratedItems
    .filter((item): item is IngredientSuggestionItem => item !== null)
    .filter((item) => matchesIngredientPickerContext(item, query.category, query.subtype))
    .slice(0, query.recentLimit);
  const { allItems } = await loadUnifiedCatalogItems(userId);
  const scopedItems = filterItemsByPickerContext(allItems, query.category, query.subtype);
  const usageAwareItems = await applyUsageCounts(userId, scopedItems);
  const brands = (query.subtype === "malt" || query.category === "yeast")
    ? buildIngredientPickerQuickStartBrands({
      items: usageAwareItems,
      recent,
      fallbackBrands: query.category === "yeast" ? [] : ingredientPickerMaltQuickStartFallbackBrands
    })
    : [];
  const groups = query.category === "consumable"
    ? buildIngredientPickerQuickStartScopedGroups({
      items: usageAwareItems,
      recent,
      category: "consumable",
      fallbackGroups: ingredientPickerConsumableQuickStartFallbackGroups
    })
    : query.category === "water_treatment"
      ? buildIngredientPickerQuickStartScopedGroups({
        items: usageAwareItems,
        recent,
        category: "water_treatment",
        fallbackGroups: ingredientPickerWaterTreatmentQuickStartFallbackGroups
      })
      : query.subtype === "fermentable"
        ? buildIngredientPickerQuickStartScopedGroups({
          items: usageAwareItems,
          recent,
          category: "fermentable",
          fallbackGroups: ingredientPickerFermentableQuickStartFallbackGroups
        })
        : [];
  const hasFavoritesAvailable = scopedItems.some((item) => item.isFavorite === true);
  const hasCustomAvailable = scopedItems.some((item) => item.source === "custom");

  return {
    brands,
    groups,
    recent,
    hasFavoritesAvailable,
    hasCustomAvailable
  };
};

export const getIngredientPickerQuickStartByContext = async (
  userId: string
): Promise<IngredientPickerQuickStartResultByContext> => {
  const [malt, fermentable, hop, yeast, waterTreatment, consumable] = await Promise.all([
    listIngredientPickerQuickStart(userId, {
      category: "fermentable",
      subtype: "malt",
      recentReferences: []
    }),
    listIngredientPickerQuickStart(userId, {
      category: "fermentable",
      subtype: "fermentable",
      recentReferences: []
    }),
    listIngredientPickerQuickStart(userId, {
      category: "hop",
      recentReferences: []
    }),
    listIngredientPickerQuickStart(userId, {
      category: "yeast",
      recentReferences: []
    }),
    listIngredientPickerQuickStart(userId, {
      category: "water_treatment",
      recentReferences: []
    }),
    listIngredientPickerQuickStart(userId, {
      category: "consumable",
      recentReferences: []
    })
  ]);

  return {
    malt,
    fermentable,
    hop,
    yeast,
    water_treatment: waterTreatment,
    consumable
  };
};

export const getIngredientPickerQuickStartBySubtype = async (
  userId: string
): Promise<IngredientPickerQuickStartResultBySubtype> => {
  const { malt, fermentable } = await getIngredientPickerQuickStartByContext(userId);

  return {
    malt,
    fermentable
  };
};

export const searchUserCatalogIngredients = async (
  userId: string,
  params: CatalogSearchParams
): Promise<IngredientSearchResult> => {
  const query = ingredientSearchQuerySchema.parse(params);
  const familyScope = resolveIngredientPickerQuickStartFamilyScope(query.family ?? null);
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
  const scopedCatalogItems = filterItemsByQuickStartFamily(subtypeFilteredCatalogItems, familyScope);
  const scopedAllItems = filterItemsByQuickStartFamily(subtypeFilteredAllItems, familyScope);
  const searchableItems = query.customOnly
    ? filterItemsByCustomState(scopedAllItems, true)
    : params.includeCustom === false
      ? scopedCatalogItems
      : scopedAllItems;
  const groupScopedItems = query.category === "consumable"
    ? filterItemsByGroup(searchableItems, "consumable", query.group)
    : query.category === "water_treatment"
      ? filterItemsByGroup(searchableItems, "water_treatment", query.group)
    : query.category === "fermentable" && query.subtype === "fermentable"
      ? filterItemsByGroup(searchableItems, "fermentable", query.group)
      : searchableItems;
  const manufacturerScopedItems = filterItemsByManufacturer(groupScopedItems, query.manufacturer);
  const favoriteScopedItems = filterItemsByFavoriteState(manufacturerScopedItems, query.favoritesOnly);
  const normalizedQuery = normalizeSearchText(query.q);
  const rankingQuery = normalizedQuery.length > 0
    ? query.q
    : (familyScope?.presetQuery ?? "");
  const rankedItems = rankingQuery
    ? (() => {
      const brandMarketCounts = buildBrandMarketCountMap(favoriteScopedItems);

      return favoriteScopedItems
        .map((item) => buildRankedItem(item, rankingQuery, brandMarketCounts))
        .filter((item): item is RankedCatalogItem => item !== null)
        .sort(sortRankedCatalogItems);
    })()
    : buildScopeOnlyRankedItems(favoriteScopedItems);
  const refinements: IngredientSearchRefinement[] = query.category === "consumable" && !query.group
    ? buildConsumableGroupRefinements(rankedItems, query.group)
    : query.category === "water_treatment" && !query.group
      ? buildWaterTreatmentGroupRefinements(rankedItems, query.group)
    : query.category === "fermentable" && query.subtype === "fermentable" && !query.group
      ? buildFermentableGroupRefinements(rankedItems, query.group)
      : buildManufacturerRefinements(rankedItems, query.manufacturer);
  const total = rankedItems.length;
  const items = rankedItems
    .slice(0, query.limit)
    .map(({ item, score }) => toIngredientSuggestionItem(item, score));
  const resolvedGroupValue = query.category === "fermentable"
    ? canonicalizeFermentableQuickStartGroup(query.group)
    : query.category === "consumable"
      ? canonicalizeConsumablePickerGroup(query.group)
      : query.category === "water_treatment"
        ? canonicalizeWaterTreatmentQuickStartGroup(query.group)
    : query.group ?? null;
  const normalizedGroup = normalizeSearchText(resolvedGroupValue ?? "");
  const normalizedManufacturer = normalizeSearchText(query.manufacturer ?? "");
  const matchedManufacturerRefinement = normalizedManufacturer
    ? refinements.find((refinement): refinement is IngredientManufacturerRefinement => (
      refinement.type === "manufacturer"
      && refinement.normalizedLabel === normalizedManufacturer
    )) ?? null
    : null;
  const appliedManufacturer = normalizedManufacturer
    ? matchedManufacturerRefinement ?? {
      type: "manufacturer" as const,
      label: query.manufacturer ?? "",
      normalizedLabel: normalizedManufacturer,
      value: query.manufacturer ?? "",
      count: total,
      score: rankedItems[0]?.score ?? 0
    }
    : null;
  const appliedGroup = normalizedGroup
    ? {
      type: "consumable_group" as const,
      label: resolveIngredientGroupLabel(query.category, resolvedGroupValue) ?? resolvedGroupValue ?? "",
      normalizedLabel: normalizedGroup,
      value: resolvedGroupValue ?? "",
      count: total,
      score: rankedItems[0]?.score ?? 0,
      description: resolveIngredientGroupDescription(query.category, resolvedGroupValue)
    }
    : null;

  return {
    items,
    refinements: query.manufacturer ? [] : refinements,
    total,
    isBroadMatch: total > ingredientSearchSimpleModeThreshold,
    hasMore: total > items.length,
    appliedManufacturer,
    appliedGroup,
    appliedFamily: familyScope,
    appliedFavoritesOnly: query.favoritesOnly,
    appliedCustomOnly: query.customOnly
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
