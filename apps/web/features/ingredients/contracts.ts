import { z } from "zod";

import {
  ingredientCategories as taxonomyIngredientCategories,
  ingredientCompletenessLevels as taxonomyIngredientCompletenessLevels,
  ingredientDisplayUnits,
  ingredientMatchPolicies as taxonomyIngredientMatchPolicies,
  ingredientMeasurementDimensions as taxonomyIngredientMeasurementDimensions,
  legacyIngredientTypes,
  resolveIngredientCategory,
  resolveIngredientCompletenessLevel,
  resolveIngredientSubtype,
  resolveLegacyIngredientType,
  type IngredientCategory,
  type IngredientCompletenessLevel,
  type IngredientDisplayUnit,
  type IngredientMatchPolicy,
  type IngredientMeasurementDimension,
  type IngredientSubtype,
  type LegacyIngredientType
} from "./taxonomy";

export const ingredientTypes = legacyIngredientTypes;
export type IngredientType = LegacyIngredientType;
export type {
  IngredientCategory,
  IngredientCompletenessLevel,
  IngredientDisplayUnit,
  IngredientMatchPolicy,
  IngredientMeasurementDimension,
  IngredientSubtype
};

export const ingredientCategories = taxonomyIngredientCategories;
export const ingredientMatchPolicies = taxonomyIngredientMatchPolicies;
export const ingredientCompletenessLevels = taxonomyIngredientCompletenessLevels;
export const ingredientMeasurementDimensions = taxonomyIngredientMeasurementDimensions;

export const ingredientDisplayModes = ["auto", "localized_first", "source_first"] as const;
export type IngredientDisplayMode = (typeof ingredientDisplayModes)[number];

export const ingredientAliasLocales = ["ru", "en", "neutral"] as const;
export type IngredientAliasLocale = (typeof ingredientAliasLocales)[number];

export type HopTechnicalData = {
  type: "hop";
  alphaAcidPctMin?: number | null;
  alphaAcidPctMax?: number | null;
  alphaAcidPctTypical?: number | null;
  betaAcidPctMin?: number | null;
  betaAcidPctMax?: number | null;
  betaAcidPctTypical?: number | null;
  oilMl100gMin?: number | null;
  oilMl100gMax?: number | null;
  oilMl100gTypical?: number | null;
  cohumulonePctMin?: number | null;
  cohumulonePctMax?: number | null;
  cohumulonePctTypical?: number | null;
  categoryBirrf?: string | null;
  categoryBirrfRu?: string | null;
  hopForm?: string | null;
  isBlend?: boolean | null;
  isPopularInRussia?: boolean | null;
  aromaDescriptorsEn?: string[];
  notes?: string | null;
};

export type MaltTechnicalData = {
  type: "malt";
  maltType?: string | null;
  extractPctDryBasis?: number | null;
  colorEbcMin?: number | null;
  colorEbcMax?: number | null;
  colorLovibond?: number | null;
  proteinPct?: number | null;
  maxUsagePct?: number | null;
  colorEbcIsApprox?: boolean | null;
};

export type FermentableTechnicalData = {
  type: "fermentable";
  fermentabilityClass?: string | null;
  extractForm?: "dry" | "liquid" | null;
  productFamily?: string | null;
  subtypeKey?: string | null;
  physicalForm?: string | null;
  baseMaterialFamily?: string | null;
  baseMaterials?: string[];
  hoppingState?: "hopped" | "unhopped" | "unknown" | "not_applicable" | null;
  isHoppedProduct?: boolean | null;
  functionalRole?: string | null;
  gravityCalcMode?: string | null;
  displayTypeRu?: string | null;
  displayTypeEn?: string | null;
  extractPctDryBasis?: number | null;
  colorEbcMin?: number | null;
  colorEbcMax?: number | null;
  colorLovibond?: number | null;
  colorEbcIsApprox?: boolean | null;
  recommendedMaxPct?: number | null;
  isUsableInBeerGravityCalculations?: boolean | null;
  beerRelevance?: string | null;
};

export type YeastTechnicalData = {
  type: "yeast";
  form?: string | null;
  yeastFamily?: string | null;
  birrfCategory?: string | null;
  attenuationPctMin?: number | null;
  attenuationPctMax?: number | null;
  attenuationPctTypical?: number | null;
  flocculation?: string | null;
  fermentationTempCMin?: number | null;
  fermentationTempCMax?: number | null;
  fermentationTempCOptimum?: number | null;
  alcoholToleranceAbvTypical?: number | null;
  sourceBasis?: string | null;
  packageSize?: number | null;
  packageUnit?: string | null;
};

export type ConsumableTechnicalData = {
  type: "consumable";
  commonForms?: string[];
  usageStage?: string[];
  dosageReference?: Record<string, unknown> | null;
  familyKey?: string | null;
  pickerGroup?: string | null;
  marketNamesRu?: string[];
  marketNamesEn?: string[];
  searchPriorityTermsRu?: string[];
  searchPriorityTermsEn?: string[];
  pickerFunctionRu?: string | null;
  pickerUsageRu?: string | null;
  brandFamilyMode?: string | null;
};

export type WaterTreatmentTechnicalData = {
  type: "water_treatment";
  formula?: string | null;
  displayFormula?: string | null;
  calculationFormula?: string | null;
  concentrationOptions?: string[];
  concentrationPct?: number | null;
  defaultConcentrationPct?: number | null;
  commonForms?: string[];
  unitPreferred?: string | null;
  typicalUseRu?: string | null;
  recommendedFor?: string[];
  waterCalcRole?: string[];
  pHEffectDirection?: string | null;
  effectOnIons?: Record<string, unknown> | null;
  calculationSupport?: string | null;
  commonInHomebrewing?: boolean | null;
  commonInProBrewing?: boolean | null;
  recommendationLevel?: string | null;
  cautionsRu?: string | null;
  sourceBasis?: string[] | string | null;
};

export type IngredientTechnicalData =
  | HopTechnicalData
  | MaltTechnicalData
  | FermentableTechnicalData
  | YeastTechnicalData
  | ConsumableTechnicalData
  | WaterTreatmentTechnicalData
  | {
    type: IngredientType;
    [key: string]: unknown;
  };

export type IngredientTechnicalFields = {
  hopAlphaAcidPct?: number | null;
  hopBetaAcidPct?: number | null;
  hopTotalOilMlPer100g?: number | null;
  hopForm?: string | null;
  fermentableExtractYieldPct?: number | null;
  fermentableColorLovibond?: number | null;
  yeastAttenuationPct?: number | null;
  yeastForm?: string | null;
  yeastMinFermentationTempC?: number | null;
  yeastMaxFermentationTempC?: number | null;
  unitPreferred?: string | null;
};

const nullableNumberField = () => z.preprocess((value) => {
  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    return Number(trimmed);
  }

  return value;
}, z.number().nullable().optional());

const optionalString = (max: number) => z.string().trim().max(max).optional().nullable();

// В отличие от optionalString — пустая строка (после trim) нормализуется в null,
// а не остаётся "". Нужно для descriptionRu: очистка поля в форме должна убирать
// секцию «Описание» на деталке, а не оставлять пустой абзац.
const optionalTextField = (max: number) => z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}, z.string().max(max).nullable().optional());

const ingredientAliasInputSchema = z.object({
  id: z.string().optional(),
  locale: z.enum(ingredientAliasLocales),
  alias: z.string().trim().min(1).max(180),
  source: z.string().trim().max(48).default("admin"),
  isEnabled: z.boolean().default(true)
});

const ingredientSourceInputSchema = z.object({
  id: z.string().optional(),
  kind: optionalString(120),
  label: optionalString(300),
  url: optionalString(2000),
  sourceBasis: optionalString(200),
  position: z.coerce.number().int().min(0).default(0)
});

const ingredientPackageVariantInputSchema = z.object({
  id: z.string().trim().min(1).max(191),
  brand: optionalString(180),
  productNameEn: optionalString(300),
  productNameRu: optionalString(300),
  countryNameRu: optionalString(180),
  packageAmount: nullableNumberField(),
  packageUnit: optionalString(32),
  stockContentAmount: nullableNumberField(),
  stockContentUnit: optionalString(32),
  sourceGroup: optionalString(240),
  sourceUrl: optionalString(2000),
  isDefaultForStock: z.boolean().default(false),
  position: z.coerce.number().int().min(0).default(0)
});

export const ingredientSearchQuerySchema = z.object({
  q: z.string().trim().max(120).default(""),
  type: z.enum(ingredientTypes).optional(),
  category: z.enum(ingredientCategories).optional(),
  subtype: z.enum(["malt", "fermentable"]).optional(),
  family: z.string().trim().min(1).max(64).optional(),
  group: z.string().trim().min(1).max(120).optional(),
  manufacturer: z.string().trim().min(1).max(180).optional(),
  favoritesOnly: z.boolean().optional().default(false),
  customOnly: z.boolean().optional().default(false),
  limit: z.coerce.number().min(1).max(100).default(10)
}).refine((value) => (
  value.q.length > 0
  || Boolean(value.family)
  || Boolean(value.group)
  || Boolean(value.manufacturer)
  || value.favoritesOnly
  || value.customOnly
), {
  message: "Search query or scope is required."
});

export const ingredientSearchSimpleModeThreshold = 10;
export const ingredientManufacturerRefinementLimit = 6;
export const ingredientSearchExpandedLimit = 100;

export const userIngredientReferenceSources = ["catalog", "custom"] as const;
export type UserIngredientReferenceSource = (typeof userIngredientReferenceSources)[number];

export const userIngredientReferenceSchema = z.object({
  source: z.enum(userIngredientReferenceSources),
  id: z.string().trim().min(1).max(191)
});
export type UserIngredientReference = z.infer<typeof userIngredientReferenceSchema>;

export const ingredientPickerQuickStartQuerySchema = z.object({
  category: z.enum(ingredientCategories),
  subtype: z.enum(["malt", "fermentable"]).nullable().optional(),
  recentReferences: z.array(userIngredientReferenceSchema).max(12).default([]),
  recentLimit: z.coerce.number().min(1).max(10).default(10)
});

export const ingredientPurchaseLinkMarketplaces = [
  "ozon",
  "wildberries",
  "avito",
  "yandex_market",
  "russkaya_dymka",
  "kolba",
  "birrf",
  "other"
] as const;
export type IngredientPurchaseLinkMarketplace = (typeof ingredientPurchaseLinkMarketplaces)[number];

export type IngredientPurchaseLinkDto = {
  id: string;
  url: string;
  normalizedUrl: string;
  host: string;
  displayHost: string;
  marketplace: IngredientPurchaseLinkMarketplace;
  marketplaceLabel: string;
  position: number;
};

export type IngredientPurchaseLinkSummaryDto = {
  count: number;
  marketplaces: IngredientPurchaseLinkMarketplace[];
};

export const ingredientUpsertSchema = z.object({
  id: z.string().trim().min(1).max(191).optional(),
  type: z.enum(ingredientTypes),
  category: z.enum(ingredientCategories).optional().nullable(),
  itemKind: optionalString(120),
  nameRu: optionalString(240),
  nameEn: optionalString(240),
  descriptionRu: optionalTextField(6000),
  displayModeRu: z.enum(ingredientDisplayModes).default("auto"),
  displayNameOverrideRu: optionalString(240),
  secondaryNameOverrideRu: optionalString(240),
  hideSecondaryNameRu: z.boolean().default(false),
  isActive: z.boolean().default(true),
  inventoryEnabled: z.boolean().default(true),
  countryCode: optionalString(8),
  countryName: optionalString(180),
  brand: optionalString(180),
  producer: optionalString(180),
  productCode: optionalString(80),
  groupName: optionalString(120),
  sourceCategory: optionalString(120),
  subcategory: optionalString(120),
  presentOnBirrf: z.boolean().optional().nullable(),
  attributes: z.record(z.string(), z.unknown()).default({}),
  quantityDefaults: z.record(z.string(), z.unknown()).optional().nullable(),
  aliases: z.array(ingredientAliasInputSchema).default([]),
  sources: z.array(ingredientSourceInputSchema).default([]),
  packageVariants: z.array(ingredientPackageVariantInputSchema).default([])
}).superRefine((value, ctx) => {
  const category = value.category ?? resolveIngredientCategory({
    category: value.category,
    type: value.type,
    subtype: value.itemKind
  });

  if (category === "water_treatment" && value.packageVariants.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Package variants are only supported for consumables",
      path: ["packageVariants"]
    });
  }
});

export const moderationActionSchema = z.object({
  action: z.enum(["approve", "reject", "merge"]),
  targetIngredientId: z.string().trim().min(1).optional(),
  resolutionNote: z.string().trim().max(1000).optional()
});

export type IngredientAliasDto = {
  id: string;
  locale: IngredientAliasLocale;
  alias: string;
  aliasNormalized: string;
  source: string;
  isEnabled: boolean;
};

export type IngredientSourceDto = {
  id: string;
  kind: string | null;
  label: string | null;
  url: string | null;
  sourceBasis: string | null;
  position: number;
};

export type IngredientPackageVariantDto = {
  id: string;
  brand: string | null;
  productNameEn: string | null;
  productNameRu: string | null;
  countryNameRu: string | null;
  packageAmount: number | null;
  packageUnit: string | null;
  stockContentAmount: number | null;
  stockContentUnit: string | null;
  sourceGroup: string | null;
  sourceUrl: string | null;
  isDefaultForStock: boolean;
  position: number;
};

export type IngredientFamilySummaryDto = null;

export type IngredientCatalogItemDto = IngredientTechnicalFields & {
  id: string;
  type: IngredientType;
  category: IngredientCategory;
  subtype: IngredientSubtype | null;
  familyId: string | null;
  family: null;
  primaryLabelRu: string;
  secondaryLabelRu: string | null;
  displayName: string;
  displayNameRu: string | null;
  displayNameEn: string | null;
  nameRu: string | null;
  nameEn: string | null;
  descriptionRu: string | null;
  displayModeRu: IngredientDisplayMode;
  displayNameOverrideRu: string | null;
  secondaryNameOverrideRu: string | null;
  hideSecondaryNameRu: boolean;
  brand: string | null;
  producer: string | null;
  brandName: string | null;
  manufacturer: string | null;
  country: string | null;
  countryCode: string | null;
  countryName: string | null;
  productCode: string | null;
  groupName: string | null;
  sourceCategory: string | null;
  subcategory: string | null;
  itemKind: string | null;
  presentOnBirrf: boolean | null;
  isActive: boolean;
  inventoryEnabled: boolean;
  attributes: Record<string, unknown>;
  technicalData: IngredientTechnicalData | null;
  aliases: IngredientAliasDto[];
  sources: IngredientSourceDto[];
  packageVariants: IngredientPackageVariantDto[];
  quantityDefaults: Record<string, unknown> | null;
  unitPreferred: string | null;
  defaultUnit: IngredientDisplayUnit;
  defaultDisplayUnit: IngredientDisplayUnit;
  allowedUnits: IngredientDisplayUnit[];
  measurementDimension: IngredientMeasurementDimension;
  completenessLevel: IngredientCompletenessLevel;
  status: "draft" | "active" | "archived" | "merged";
  visibility: "public" | "internal";
  mergedIntoId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type IngredientSuggestionItem = {
  id: string;
  type: IngredientType;
  category?: IngredientCategory;
  subtype?: IngredientSubtype | null;
  itemKind?: string | null;
  familyId?: string | null;
  primaryLabelRu?: string;
  secondaryLabelRu?: string | null;
  displayName: string;
  displayNameRu?: string | null;
  displayNameEn?: string | null;
  nameRu?: string | null;
  nameEn?: string | null;
  displayModeRu?: IngredientDisplayMode;
  subtitle?: string;
  brand?: string | null;
  producer?: string | null;
  brandName?: string | null;
  manufacturer?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  country?: string | null;
  harvestYear?: number | null;
  productCode?: string | null;
  sourceCategory?: string | null;
  subcategory?: string | null;
  technicalData?: IngredientTechnicalData | null;
  defaultUnit: IngredientDisplayUnit;
  defaultDisplayUnit?: IngredientDisplayUnit;
  allowedUnits?: IngredientDisplayUnit[];
  measurementDimension?: IngredientMeasurementDimension;
  completenessLevel?: IngredientCompletenessLevel;
  quantityDefaults?: Record<string, unknown> | null;
  unitPreferred?: string | null;
  groupName?: string | null;
  packageVariants?: IngredientPackageVariantDto[];
  familyDisplayName?: string | null;
  familyCanonicalName?: string | null;
  inventoryItemId?: string | null;
  inventoryQuantityLabel?: string | null;
  inventoryNormalizedQuantity?: number | null;
  inventoryNormalizedUnit?: string | null;
  inventoryPurchasePriceLabel?: string | null;
  inventoryUnitPriceLabel?: string | null;
  inventoryPurchasedAt?: string | null;
  inventoryFreshnessDate?: string | null;
  inventoryUpdatedAt?: string | null;
  inventoryNotes?: string | null;
  inventoryPurchaseLinksCount?: number | null;
  matchType?: "name" | "alias" | "code" | "package" | "brand" | "token";
  matchedAlias?: string | null;
  matchedPackageVariantId?: string | null;
  matchedPackageVariantName?: string | null;
  score?: number;
  derivedFromIngredientId?: string | null;
  derivedFromDisplayName?: string | null;
  isFavorite?: boolean;
  source: "catalog" | "custom";
};

export type IngredientManufacturerRefinement = {
  type: "manufacturer";
  label: string;
  normalizedLabel: string;
  value: string;
  count: number;
  score: number;
  description?: string | null;
};

export type IngredientConsumableGroupRefinement = {
  type: "consumable_group";
  label: string;
  normalizedLabel: string;
  value: string;
  count: number;
  score: number;
  description?: string | null;
};

export type IngredientSearchRefinement =
  | IngredientManufacturerRefinement
  | IngredientConsumableGroupRefinement;

export type IngredientSearchFamilyScope = {
  key: string;
  label: string;
  presetQuery: string;
};

export type IngredientSearchResult = {
  items: IngredientSuggestionItem[];
  refinements: IngredientSearchRefinement[];
  total: number;
  isBroadMatch: boolean;
  hasMore: boolean;
  appliedManufacturer: IngredientManufacturerRefinement | null;
  appliedGroup: IngredientConsumableGroupRefinement | null;
  appliedFamily: IngredientSearchFamilyScope | null;
  appliedFavoritesOnly: boolean;
  appliedCustomOnly: boolean;
};

export type IngredientPickerQuickStartAvailability = {
  hasFavoritesAvailable: boolean;
  hasCustomAvailable: boolean;
};

export type IngredientPickerQuickStartContextKey =
  | Extract<IngredientSubtype, "malt" | "fermentable">
  | Extract<IngredientCategory, "hop" | "yeast" | "water_treatment" | "consumable">;

export type IngredientPickerQuickStartAvailabilityByContext = Record<
  IngredientPickerQuickStartContextKey,
  IngredientPickerQuickStartAvailability
>;

export type IngredientPickerQuickStartAvailabilityBySubtype = Record<
  Extract<IngredientSubtype, "malt" | "fermentable">,
  IngredientPickerQuickStartAvailability
>;

export type IngredientPickerQuickStartResult = IngredientPickerQuickStartAvailability & {
  brands: IngredientManufacturerRefinement[];
  groups?: IngredientConsumableGroupRefinement[];
  recent: IngredientSuggestionItem[];
};

export type IngredientPickerQuickStartResultByContext = Record<
  IngredientPickerQuickStartContextKey,
  IngredientPickerQuickStartResult
>;

export type IngredientPickerQuickStartResultBySubtype = Pick<
  IngredientPickerQuickStartResultByContext,
  Extract<IngredientSubtype, "malt" | "fermentable">
>;

export const ingredientCatalogViews = ["all", "mine"] as const;
export type IngredientCatalogView = (typeof ingredientCatalogViews)[number];

export const ingredientCatalogSortOptions = ["name", "updated", "category", "brand", "alpha", "color", "attenuation"] as const;
export type IngredientCatalogSortOption = (typeof ingredientCatalogSortOptions)[number];

export type UserCatalogIngredientDto = IngredientTechnicalFields & {
  id: string;
  source: "catalog" | "custom";
  type: IngredientType;
  category: IngredientCategory;
  subtype: IngredientSubtype | null;
  familyId: string | null;
  primaryLabelRu: string;
  secondaryLabelRu: string | null;
  displayName: string;
  displayNameRu: string | null;
  displayNameEn: string | null;
  nameRu: string | null;
  nameEn: string | null;
  descriptionRu: string | null;
  displayModeRu: IngredientDisplayMode;
  displayNameOverrideRu: string | null;
  secondaryNameOverrideRu: string | null;
  hideSecondaryNameRu: boolean;
  brand: string | null;
  producer: string | null;
  brandName: string | null;
  manufacturer: string | null;
  country: string | null;
  countryCode: string | null;
  countryName: string | null;
  productCode: string | null;
  groupName: string | null;
  sourceCategory: string | null;
  subcategory: string | null;
  itemKind: string | null;
  aliases: IngredientAliasDto[];
  sources: IngredientSourceDto[];
  packageVariants: IngredientPackageVariantDto[];
  notes: string | null;
  technicalData: IngredientTechnicalData | null;
  properties: Record<string, unknown> | null;
  defaultUnit: IngredientDisplayUnit;
  defaultDisplayUnit: IngredientDisplayUnit;
  allowedUnits: IngredientDisplayUnit[];
  measurementDimension: IngredientMeasurementDimension;
  completenessLevel: IngredientCompletenessLevel | null;
  quantityDefaults: Record<string, unknown> | null;
  unitPreferred: string | null;
  derivedFromIngredientId: string | null;
  derivedFromDisplayName: string | null;
  isFavorite?: boolean;
  purchaseLinks?: IngredientPurchaseLinkDto[];
  inventoryUsageCount: number;
  recipeUsageCount: number;
  inventoryInUse: boolean;
  recipeInUse: boolean;
  // Кастомные ингредиенты не проходят модерационный жизненный цикл — для них
  // всегда "active"/true (см. mapCustomIngredient в catalog-service.ts).
  isActive: boolean;
  status: "draft" | "active" | "archived" | "merged";
  createdAt: Date;
  updatedAt: Date;
};

export type UserCatalogListResult = {
  items: UserCatalogIngredientDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  facets: {
    byCategory: Record<IngredientCategory, number>;
    filteredByCategory: Record<IngredientCategory, number>;
    byFermentableSubtype: {
      malt: number;
      fermentable: number;
    };
    customCount: number;
    catalogCount: number;
  };
};

export type IngredientProposalDto = {
  id: string;
  sourcePayload: Record<string, unknown>;
  sourceType: string;
  sourceDisplayName: string;
  normalizedName: string;
  status: "pending" | "approved" | "rejected" | "merged";
  targetIngredientId: string | null;
  moderatorId: string | null;
  resolutionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const resolveUpsertCompletenessLevel = (value: z.infer<typeof ingredientUpsertSchema>) => resolveIngredientCompletenessLevel({
  category: value.category ?? resolveIngredientCategory({ type: value.type, subtype: value.itemKind }),
  type: value.type,
  subtype: resolveIngredientSubtype({ type: value.type, subtype: value.itemKind }),
  nameRu: value.nameRu,
  nameEn: value.nameEn,
  aliases: value.aliases.map((alias) => alias.alias),
  brand: value.brand,
  producer: value.producer
});
