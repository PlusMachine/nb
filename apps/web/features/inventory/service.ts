import {
  and,
  db,
  eq,
  ingredientPackageVariants,
  ingredients,
  isNull,
  recipeIngredients,
  sql,
  userCustomIngredients,
  userIngredients
} from "@nb/db";
import { z } from "zod";

import {
  addCatalogInventoryItemSchema,
  addCustomInventoryItemSchema,
  createUserCustomIngredientSchema,
  inventorySourceLinkageSchema,
  inventoryListQuerySchema,
  type InventoryListItemDto,
  type InventorySourceDto,
  type InventorySummaryDto,
  updateInventoryItemSchema,
  updateInventoryQuantitySchema
} from "./contracts";
import type { IngredientTechnicalData } from "../ingredients/contracts";
import { normalizeIngredientName } from "../ingredients/normalization";
import {
  buildIngredientTypedSummary,
  resolveIngredientPrimaryDisplayName
} from "../ingredients/presentation";
import {
  extractIngredientTechnicalData,
  extractIngredientTechnicalFields
} from "../ingredients/technical-fields";
import {
  buildCatalogIngredientLinkage,
  buildCustomIngredientLinkage,
  type IngredientSourceLinkage
} from "../ingredients/source-linkage";
import {
  resolveIngredientCategory,
  resolveIngredientSubtype,
  resolveLegacyIngredientType
} from "../ingredients/taxonomy";
import { type SystemCurrency, listSystemCurrencyRates } from "../system/currency-rates";
import { normalizeInventoryPurchaseContext } from "./purchase-cost";
import {
  getInventoryUnitDimension,
  normalizeInventoryMeasurementForProfile,
  parseInventoryUnit,
  resolveHumanFacingInventoryUnitProfile,
  type InventoryUnit,
  type InventoryUnitProfile
} from "./units";
import { resolveInventoryPackEquivalent } from "./pack";
import {
  buildCustomIngredientTechnicalData,
  resolveCustomIngredientUnitProfile
} from "./custom-ingredient";

type InventoryWriteContext = {
  preferredCurrency?: SystemCurrency | null;
};

type InventoryRow = {
  inventory: typeof userIngredients.$inferSelect;
  catalog: typeof ingredients.$inferSelect | null;
  custom: typeof userCustomIngredients.$inferSelect | null;
  packageVariant: typeof ingredientPackageVariants.$inferSelect | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object"
  && value !== null
  && !Array.isArray(value)
);

const normalizeStoredCategory = (
  category?: typeof userIngredients.$inferSelect.ingredientCategory | null
): InventorySourceDto["category"] | null => {
  if (category === "water_prep") {
    return "water_treatment";
  }

  if (category === "misc") {
    return "consumable";
  }

  return category as InventorySourceDto["category"] | null;
};

const normalizeStoredSubtype = (
  category: InventorySourceDto["category"] | null,
  subtype?: string | null
): InventorySourceDto["subtype"] => {
  if (!subtype) {
    return null;
  }

  return resolveIngredientSubtype({
    category: category ?? undefined,
    subtype
  }) as InventorySourceDto["subtype"];
};

const ensureSourceLinkage = (ingredientCatalogItemId?: string | null, userCustomIngredientId?: string | null) => {
  const result = inventorySourceLinkageSchema.safeParse({ ingredientCatalogItemId, userCustomIngredientId });
  if (!result.success) {
    throw new Error("INVALID_SOURCE_LINKAGE");
  }
};

const buildInventoryWhere = (userId: string, includeArchived: boolean) => and(
  eq(userIngredients.userId, userId),
  includeArchived ? undefined : isNull(userIngredients.archivedAt)
);

const buildInventorySearchWhere = (search: string) => {
  if (!search) {
    return undefined;
  }

  const term = `%${search}%`;
  return sql<boolean>`coalesce(${userIngredients.ingredientDisplayNameSnapshot}, ${ingredients.nameRu}, ${ingredients.nameEn}, ${userCustomIngredients.displayName}) ilike ${term}`;
};

const buildLiveInventoryLinkage = (
  catalog: typeof ingredients.$inferSelect | null,
  custom: typeof userCustomIngredients.$inferSelect | null
): IngredientSourceLinkage | null => {
  if (catalog) {
    return buildCatalogIngredientLinkage(catalog);
  }

  if (custom) {
    return buildCustomIngredientLinkage(custom);
  }

  return null;
};

const resolveSnapshotType = (
  inventory: typeof userIngredients.$inferSelect,
  liveLinkage: IngredientSourceLinkage | null
) => (
  resolveLegacyIngredientType({
    category: normalizeStoredCategory(inventory.ingredientCategory),
    subtype: inventory.ingredientSubtype
  })
  ?? liveLinkage?.type
  ?? "consumable"
);

const resolveSnapshotPrimaryLabel = (
  inventory: typeof userIngredients.$inferSelect,
  liveLinkage: IngredientSourceLinkage | null
) => liveLinkage?.displayName ?? inventory.ingredientDisplayNameSnapshot ?? null;

const buildCatalogSourceDto = (
  catalog: typeof ingredients.$inferSelect,
  packageVariant: typeof ingredientPackageVariants.$inferSelect | null
): InventorySourceDto => {
  const linkage = buildCatalogIngredientLinkage(catalog);
  return {
    sourceKind: "catalog",
    sourceId: catalog.id,
    type: linkage.type,
    category: linkage.category,
    subtype: linkage.subtype,
    familyId: linkage.familyId,
    familyDisplayName: linkage.familyDisplayName,
    primaryLabelRu: linkage.displayName,
    secondaryLabelRu: (() => {
      const primaryName = linkage.displayName;
      const secondaryName = catalog.nameEn && normalizeIngredientName(catalog.nameEn) !== normalizeIngredientName(primaryName)
        ? catalog.nameEn
        : catalog.nameRu && normalizeIngredientName(catalog.nameRu) !== normalizeIngredientName(primaryName)
          ? catalog.nameRu
          : null;
      return secondaryName;
    })(),
    displayName: linkage.displayName,
    displayNameRu: catalog.nameRu,
    displayNameEn: catalog.nameEn,
    nameRu: catalog.nameRu,
    nameEn: catalog.nameEn,
    normalizedName: normalizeIngredientName(linkage.displayName),
    brand: catalog.brand,
    producer: catalog.producer,
    brandName: catalog.brand,
    manufacturer: catalog.producer,
    country: catalog.countryName,
    completenessLevel: "recommended",
    technicalData: linkage.technicalData,
    defaultDisplayUnit: linkage.defaultDisplayUnit,
    allowedUnits: linkage.allowedUnits,
    measurementDimension: linkage.measurementDimension,
    packageVariantId: packageVariant?.id ?? null,
    packageVariantName: packageVariant?.productNameRu ?? null,
    summary: linkage.summary,
    ...extractIngredientTechnicalFields({
      type: catalog.type,
      attributes: catalog.attributes
    })
  };
};

const buildCustomSourceDto = (
  custom: typeof userCustomIngredients.$inferSelect
): InventorySourceDto => {
  const linkage = buildCustomIngredientLinkage(custom);
  const properties = isRecord(custom.properties) ? custom.properties : {};
  const brand = custom.manufacturer
    ?? (typeof properties.brand === "string" && properties.brand.trim().length > 0 ? properties.brand.trim() : null);
  const harvestYear = typeof properties.harvestYear === "number" && Number.isFinite(properties.harvestYear)
    ? properties.harvestYear
    : (() => {
      const normalized = Number.parseInt(String(custom.hopSeason ?? ""), 10);
      return Number.isFinite(normalized) ? normalized : null;
    })();

  return {
    sourceKind: "custom",
    sourceId: custom.id,
    type: linkage.type,
    category: linkage.category,
    subtype: linkage.subtype,
    familyId: linkage.familyId,
    familyDisplayName: linkage.familyDisplayName,
    primaryLabelRu: linkage.displayName,
    secondaryLabelRu: linkage.displayNameEn && linkage.displayNameEn !== linkage.displayName
      ? linkage.displayNameEn
      : null,
    displayName: linkage.displayName,
    displayNameRu: linkage.displayNameRu ?? null,
    displayNameEn: linkage.displayNameEn ?? null,
    nameRu: linkage.displayNameRu ?? null,
    nameEn: linkage.displayNameEn ?? null,
    normalizedName: normalizeIngredientName(linkage.displayName),
    brand,
    producer: brand,
    brandName: brand,
    manufacturer: brand,
    country: custom.country,
    harvestYear,
    completenessLevel: null,
    technicalData: linkage.technicalData,
    defaultDisplayUnit: linkage.defaultDisplayUnit,
    allowedUnits: linkage.allowedUnits,
    measurementDimension: linkage.measurementDimension,
    packageVariantId: null,
    packageVariantName: null,
    summary: linkage.summary,
    ...extractIngredientTechnicalFields({
      type: linkage.type,
      technicalData: linkage.technicalData
    })
  };
};

const resolvePersistedInventorySource = (row: InventoryRow) => {
  if (row.catalog) {
    const snapshotCategory = normalizeStoredCategory(row.inventory.ingredientCategory);
    return {
      source: buildCatalogSourceDto(row.catalog, row.packageVariant),
      snapshot: {
        ingredientCatalogItemId: row.inventory.ingredientCatalogItemId ?? null,
        userCustomIngredientId: row.inventory.userCustomIngredientId ?? null,
        ingredientFamilyId: row.inventory.ingredientFamilyId ?? null,
        ingredientCategory: snapshotCategory,
        ingredientSubtype: normalizeStoredSubtype(snapshotCategory, row.inventory.ingredientSubtype),
        ingredientDisplayNameSnapshot: row.inventory.ingredientDisplayNameSnapshot,
        ingredientDefaultDisplayUnitSnapshot: row.inventory.ingredientDefaultDisplayUnitSnapshot
          ? parseInventoryUnit(row.inventory.ingredientDefaultDisplayUnitSnapshot)
          : null,
        ingredientMeasurementDimension: row.inventory.ingredientMeasurementDimension
      }
    };
  }

  if (row.custom) {
    const snapshotCategory = normalizeStoredCategory(row.inventory.ingredientCategory);
    return {
      source: buildCustomSourceDto(row.custom),
      snapshot: {
        ingredientCatalogItemId: row.inventory.ingredientCatalogItemId ?? null,
        userCustomIngredientId: row.inventory.userCustomIngredientId ?? null,
        ingredientFamilyId: row.inventory.ingredientFamilyId ?? null,
        ingredientCategory: snapshotCategory,
        ingredientSubtype: normalizeStoredSubtype(snapshotCategory, row.inventory.ingredientSubtype),
        ingredientDisplayNameSnapshot: row.inventory.ingredientDisplayNameSnapshot,
        ingredientDefaultDisplayUnitSnapshot: row.inventory.ingredientDefaultDisplayUnitSnapshot
          ? parseInventoryUnit(row.inventory.ingredientDefaultDisplayUnitSnapshot)
          : null,
        ingredientMeasurementDimension: row.inventory.ingredientMeasurementDimension
      }
    };
  }

  const liveLinkage = buildLiveInventoryLinkage(row.catalog, row.custom);
  const type = resolveSnapshotType(row.inventory, liveLinkage);
  const category = normalizeStoredCategory(row.inventory.ingredientCategory) ?? liveLinkage?.category ?? resolveIngredientCategory({ type });
  const subtype = normalizeStoredSubtype(category, row.inventory.ingredientSubtype) ?? liveLinkage?.subtype ?? null;
  const primaryLabelRu = resolveSnapshotPrimaryLabel(row.inventory, liveLinkage);

  if (!primaryLabelRu) {
    throw new Error("INVALID_SOURCE_LINKAGE");
  }

  const unitProfile = resolveHumanFacingInventoryUnitProfile({
    type,
    category,
    subtype,
    defaultDisplayUnit: row.inventory.ingredientDefaultDisplayUnitSnapshot,
    measurementDimension: row.inventory.ingredientMeasurementDimension
  });

  return {
    source: {
      sourceKind: row.inventory.userCustomIngredientId ? "custom" : "catalog",
      sourceId: row.inventory.userCustomIngredientId ?? row.inventory.ingredientCatalogItemId ?? row.inventory.id,
      type,
      category,
      subtype,
      familyId: row.inventory.ingredientFamilyId ?? null,
      familyDisplayName: null,
      primaryLabelRu,
      secondaryLabelRu: null,
      displayName: primaryLabelRu,
      displayNameRu: null,
      displayNameEn: null,
      nameRu: null,
      nameEn: null,
      normalizedName: normalizeIngredientName(primaryLabelRu),
      brand: null,
      producer: null,
      brandName: null,
      manufacturer: null,
      country: null,
      completenessLevel: null,
      technicalData: null,
      defaultDisplayUnit: unitProfile.defaultUnit,
      allowedUnits: unitProfile.allowedUnits,
      measurementDimension: unitProfile.measurementDimension,
      packageVariantId: row.inventory.packageVariantId ?? null,
      packageVariantName: row.packageVariant?.productNameRu ?? null,
      summary: null
    } satisfies InventorySourceDto,
    snapshot: {
      ingredientCatalogItemId: row.inventory.ingredientCatalogItemId ?? null,
      userCustomIngredientId: row.inventory.userCustomIngredientId ?? null,
      ingredientFamilyId: row.inventory.ingredientFamilyId ?? null,
      ingredientCategory: category,
      ingredientSubtype: subtype,
      ingredientDisplayNameSnapshot: primaryLabelRu,
      ingredientDefaultDisplayUnitSnapshot: row.inventory.ingredientDefaultDisplayUnitSnapshot
        ? parseInventoryUnit(row.inventory.ingredientDefaultDisplayUnitSnapshot)
        : null,
      ingredientMeasurementDimension: row.inventory.ingredientMeasurementDimension
    }
  };
};

const mapInventoryRow = (row: InventoryRow): InventoryListItemDto => {
  const { source, snapshot } = resolvePersistedInventorySource(row);

  const enteredUnit = parseInventoryUnit(row.inventory.enteredUnit);
  const normalizedUnit = parseInventoryUnit(row.inventory.normalizedUnit);
  if (!enteredUnit || !normalizedUnit) {
    throw new Error("INVALID_INVENTORY_UNIT");
  }

  return {
    id: row.inventory.id,
    ingredientCatalogItemId: snapshot.ingredientCatalogItemId,
    userCustomIngredientId: snapshot.userCustomIngredientId,
    packageVariantId: row.inventory.packageVariantId ?? null,
    ingredientFamilyId: snapshot.ingredientFamilyId,
    ingredientCategory: snapshot.ingredientCategory,
    ingredientSubtype: snapshot.ingredientSubtype,
    ingredientDisplayNameSnapshot: snapshot.ingredientDisplayNameSnapshot,
    ingredientDefaultDisplayUnitSnapshot: snapshot.ingredientDefaultDisplayUnitSnapshot,
    ingredientMeasurementDimension: snapshot.ingredientMeasurementDimension,
    enteredQuantity: row.inventory.enteredQuantity,
    enteredUnit,
    normalizedQuantity: row.inventory.normalizedQuantity,
    normalizedUnit,
    unitDimension: row.inventory.unitDimension,
    priceInputMode: row.inventory.priceInputMode ?? (row.inventory.purchasePriceMinor != null ? "total" : null),
    priceInputAmountMinor: row.inventory.priceInputAmountMinor ?? row.inventory.purchasePriceMinor,
    priceInputCurrency: (row.inventory.priceInputCurrency as SystemCurrency | null)
      ?? (row.inventory.purchaseCurrency as SystemCurrency | null),
    purchasePriceMinor: row.inventory.purchasePriceMinor,
    purchaseCurrency: row.inventory.purchaseCurrency as SystemCurrency | null,
    purchaseQuantity: row.inventory.purchaseQuantity,
    purchaseQuantityUnit: row.inventory.purchaseQuantityUnit ? parseInventoryUnit(row.inventory.purchaseQuantityUnit) : null,
    purchaseQuantityNormalized: row.inventory.purchaseQuantityNormalized,
    purchaseQuantityNormalizedUnit: row.inventory.purchaseQuantityNormalizedUnit
      ? parseInventoryUnit(row.inventory.purchaseQuantityNormalizedUnit)
      : null,
    normalizedUnitCostMinorRub: row.inventory.normalizedUnitCostMinorRub,
    purchasedAt: row.inventory.purchasedAt,
    freshnessDate: row.inventory.freshnessDate,
    notes: row.inventory.notes,
    archivedAt: row.inventory.archivedAt,
    createdAt: row.inventory.createdAt,
    updatedAt: row.inventory.updatedAt,
    source
  };
};

const ensureCatalogIngredientExists = async (ingredientCatalogItemId: string) => {
  const catalogItem = await db.query.ingredients.findFirst({
    where: and(
      eq(ingredients.id, ingredientCatalogItemId),
      eq(ingredients.isActive, true)
    )
  });

  if (!catalogItem) {
    throw new Error("CATALOG_INGREDIENT_NOT_FOUND");
  }

  return catalogItem;
};

const ensureCatalogPackageVariant = async (ingredientId: string, packageVariantId?: string | null) => {
  if (!packageVariantId) {
    return null;
  }

  const variant = await db.query.ingredientPackageVariants.findFirst({
    where: and(
      eq(ingredientPackageVariants.id, packageVariantId),
      eq(ingredientPackageVariants.ingredientId, ingredientId)
    )
  });

  if (!variant) {
    throw new Error("PACKAGE_VARIANT_NOT_FOUND");
  }

  return variant;
};

const ensureOwnedCustomIngredient = async (userId: string, userCustomIngredientId: string) => {
  const customIngredient = await db.query.userCustomIngredients.findFirst({
    where: and(
      eq(userCustomIngredients.id, userCustomIngredientId),
      eq(userCustomIngredients.userId, userId)
    )
  });

  if (!customIngredient) {
    throw new Error("CUSTOM_INGREDIENT_NOT_FOUND");
  }

  return customIngredient;
};

const ensureInventoryItem = async (userId: string, inventoryItemId: string) => {
  const item = await db.query.userIngredients.findFirst({
    where: and(
      eq(userIngredients.id, inventoryItemId),
      eq(userIngredients.userId, userId)
    )
  });

  if (!item) {
    throw new Error("NOT_FOUND");
  }

  return item;
};

const normalizeMeasurementWithPackageVariant = (
  profile: InventoryUnitProfile,
  enteredQuantity: number,
  enteredUnitInput: string,
  packageVariant: typeof ingredientPackageVariants.$inferSelect | null,
  technicalData?: IngredientTechnicalData | null
) => {
  const enteredUnit = parseInventoryUnit(enteredUnitInput);
  if (!enteredUnit) {
    throw new Error("INVALID_UNIT");
  }

  if (
    packageVariant
    && enteredUnit === "pack"
    && packageVariant.stockContentAmount != null
    && packageVariant.stockContentUnit
  ) {
    const stockUnit = parseInventoryUnit(packageVariant.stockContentUnit);
    if (!stockUnit) {
      throw new Error("INVALID_UNIT");
    }

    return {
      enteredQuantity,
      enteredUnit,
      normalizedQuantity: Number((enteredQuantity * packageVariant.stockContentAmount).toFixed(3)),
      normalizedUnit: stockUnit,
      unitDimension: getInventoryUnitDimension(stockUnit)
    };
  }

  if (enteredUnit === "pack") {
    const packEquivalent = resolveInventoryPackEquivalent(technicalData);
    if (packEquivalent) {
      return {
        enteredQuantity,
        enteredUnit,
        normalizedQuantity: Number((enteredQuantity * packEquivalent.normalizedQuantity).toFixed(3)),
        normalizedUnit: packEquivalent.normalizedUnit,
        unitDimension: getInventoryUnitDimension(packEquivalent.normalizedUnit)
      };
    }
  }

  return normalizeInventoryMeasurementForProfile(profile, enteredQuantity, enteredUnitInput);
};

const buildCatalogProfile = (catalogItem: typeof ingredients.$inferSelect) => {
  const type = catalogItem.type as InventorySourceDto["type"];
  const category = resolveIngredientCategory({ type });
  const subtype = resolveIngredientSubtype({ type, subtype: catalogItem.itemKind }) as InventorySourceDto["subtype"];
  const technicalData = extractIngredientTechnicalData({
    type: catalogItem.type,
    attributes: catalogItem.attributes
  });

  return {
    type,
    category,
    subtype,
    technicalData,
    profile: resolveHumanFacingInventoryUnitProfile({
      type,
      category,
      subtype,
      quantityDefaults: isRecord(catalogItem.quantityDefaults) ? catalogItem.quantityDefaults : null,
      unitPreferred: technicalData?.type === "water_treatment" && typeof technicalData.unitPreferred === "string"
        ? technicalData.unitPreferred
        : null,
      technicalData
    })
  };
};

const uniqueTrimmedStrings = (values: string[] | undefined) => Array.from(new Set(
  (values ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
));

const buildPersistedCustomIngredientValues = (
  parsed: z.infer<typeof createUserCustomIngredientSchema>,
  userId: string
) => {
  const type = resolveLegacyIngredientType({
    type: parsed.type,
    category: parsed.category,
    subtype: parsed.subtype
  });
  const category = resolveIngredientCategory({ type, category: parsed.category });
  const subtype = resolveIngredientSubtype({ type, category, subtype: parsed.subtype });
  const brand = parsed.brand?.trim() ? parsed.brand.trim() : null;
  const country = parsed.country?.trim() ? parsed.country.trim() : null;
  const aliases = uniqueTrimmedStrings(parsed.aliases);
  const technicalData = buildCustomIngredientTechnicalData({
    type,
    fermentableColorEbc: parsed.fermentableColorEbc ?? null,
    fermentableExtractYieldPct: parsed.fermentableExtractYieldPct ?? null,
    fermentableProteinPct: parsed.fermentableProteinPct ?? null,
    hopAlphaAcidPct: parsed.hopAlphaAcidPct ?? null,
    hopBetaAcidPct: parsed.hopBetaAcidPct ?? null,
    hopForm: parsed.hopForm ?? null,
    yeastAttenuationPct: parsed.yeastAttenuationPct ?? null,
    yeastForm: parsed.yeastForm ?? null,
    yeastFlocculation: parsed.yeastFlocculation ?? null,
    yeastMinFermentationTempC: parsed.yeastMinFermentationTempC ?? null,
    yeastMaxFermentationTempC: parsed.yeastMaxFermentationTempC ?? null,
    alcoholToleranceAbvTypical: parsed.alcoholToleranceAbvTypical ?? null,
    physicalForm: parsed.physicalForm ?? null,
    concentration: parsed.concentration ?? null,
    unitPreferred: parsed.defaultDisplayUnit ?? null
  });
  const unitProfile = resolveCustomIngredientUnitProfile({
    type,
    category,
    subtype,
    technicalData
  });
  const defaultDisplayUnit = parsed.defaultDisplayUnit ?? unitProfile.defaultUnit;
  const displayModeRu = parsed.displayModeRu ?? "auto";
  const displayName = resolveIngredientPrimaryDisplayName({
    displayName: parsed.displayName,
    nameRu: parsed.nameRu,
    nameEn: parsed.nameEn,
    displayModeRu,
    displayNameOverrideRu: parsed.displayNameOverrideRu
  }) || parsed.displayName;

  return {
    type,
    category,
    subtype,
    displayName,
    defaultDisplayUnit,
    brand,
    country,
    technicalData,
    unitProfile,
    values: {
      userId,
      type,
      displayName,
      normalizedName: normalizeIngredientName(displayName),
      manufacturer: brand,
      country,
      fermentableColorEbc: parsed.fermentableColorEbc ?? null,
      fermentableExtractYieldPct: parsed.fermentableExtractYieldPct ?? null,
      hopAlphaAcidPct: parsed.hopAlphaAcidPct ?? null,
      hopForm: parsed.hopForm ?? null,
      hopSeason: parsed.harvestYear == null ? null : String(parsed.harvestYear),
      yeastAttenuationPct: parsed.yeastAttenuationPct ?? null,
      yeastForm: parsed.yeastForm === "dry" || parsed.yeastForm === "liquid" ? parsed.yeastForm : null,
      yeastMinFermentationTempC: parsed.yeastMinFermentationTempC ?? null,
      yeastMaxFermentationTempC: parsed.yeastMaxFermentationTempC ?? null,
      properties: {
        ...parsed.properties,
        category,
        subtype,
        brand,
        country,
        nameRu: parsed.nameRu ?? null,
        nameEn: parsed.nameEn ?? null,
        aliases: aliases.map((alias) => ({
          locale: "neutral",
          alias,
          source: "custom",
          isEnabled: true
        })),
        notes: parsed.notes ?? null,
        displayModeRu,
        displayNameOverrideRu: parsed.displayNameOverrideRu ?? null,
        secondaryNameOverrideRu: parsed.secondaryNameOverrideRu ?? null,
        hideSecondaryNameRu: parsed.hideSecondaryNameRu ?? false,
        harvestYear: parsed.harvestYear ?? null,
        productCode: parsed.productCode ?? null,
        derivedFromIngredientId: parsed.derivedFromIngredientId ?? null,
        derivedFromDisplayName: parsed.derivedFromDisplayName ?? null,
        hopForm: parsed.hopForm ?? null,
        hopBetaAcidPct: parsed.hopBetaAcidPct ?? null,
        fermentableProteinPct: parsed.fermentableProteinPct ?? null,
        yeastForm: parsed.yeastForm ?? null,
        yeastFlocculation: parsed.yeastFlocculation ?? null,
        yeastMinFermentationTempC: parsed.yeastMinFermentationTempC ?? null,
        yeastMaxFermentationTempC: parsed.yeastMaxFermentationTempC ?? null,
        alcoholToleranceAbvTypical: parsed.alcoholToleranceAbvTypical ?? null,
        technicalData,
        defaultDisplayUnit,
        allowedUnits: unitProfile.allowedUnits,
        measurementDimension: unitProfile.measurementDimension,
        concentration: parsed.concentration ?? null,
        physicalForm: parsed.physicalForm ?? null,
        updatedByUserId: userId
      },
      visibility: parsed.visibility
    } satisfies typeof userCustomIngredients.$inferInsert
  };
};

export const createUserCustomIngredient = async (userId: string, payload: unknown) => {
  const parsed = createUserCustomIngredientSchema.parse(payload);
  const prepared = buildPersistedCustomIngredientValues(parsed, userId);

  const [created] = await db.insert(userCustomIngredients).values({
    ...prepared.values
  }).returning();

  return created;
};

export const updateUserCustomIngredient = async (
  userId: string,
  userCustomIngredientId: string,
  payload: unknown
) => {
  await ensureOwnedCustomIngredient(userId, userCustomIngredientId);
  const parsed = createUserCustomIngredientSchema.parse(payload);
  const prepared = buildPersistedCustomIngredientValues(parsed, userId);

  const [updated] = await db.update(userCustomIngredients).set({
    type: prepared.values.type,
    displayName: prepared.values.displayName,
    normalizedName: prepared.values.normalizedName,
    manufacturer: prepared.values.manufacturer,
    country: prepared.values.country,
    fermentableColorEbc: prepared.values.fermentableColorEbc,
    fermentableExtractYieldPct: prepared.values.fermentableExtractYieldPct,
    hopAlphaAcidPct: prepared.values.hopAlphaAcidPct,
    hopForm: prepared.values.hopForm,
    hopSeason: prepared.values.hopSeason,
    yeastAttenuationPct: prepared.values.yeastAttenuationPct,
    yeastForm: prepared.values.yeastForm,
    yeastMinFermentationTempC: prepared.values.yeastMinFermentationTempC,
    yeastMaxFermentationTempC: prepared.values.yeastMaxFermentationTempC,
    properties: prepared.values.properties,
    visibility: prepared.values.visibility,
    updatedAt: new Date()
  }).where(and(
    eq(userCustomIngredients.id, userCustomIngredientId),
    eq(userCustomIngredients.userId, userId)
  )).returning();

  if (!updated) {
    throw new Error("CUSTOM_INGREDIENT_NOT_FOUND");
  }

  return updated;
};

export const deleteUserCustomIngredient = async (userId: string, userCustomIngredientId: string) => {
  const current = await ensureOwnedCustomIngredient(userId, userCustomIngredientId);
  const [inventoryUsageRow] = await db.select({
    count: sql<number>`count(*)::int`
  }).from(userIngredients).where(eq(userIngredients.userCustomIngredientId, userCustomIngredientId));

  const [recipeUsageRow] = await db.select({
    count: sql<number>`count(*)::int`
  }).from(recipeIngredients).where(eq(recipeIngredients.userCustomIngredientId, userCustomIngredientId));

  if ((inventoryUsageRow?.count ?? 0) > 0 || (recipeUsageRow?.count ?? 0) > 0) {
    throw new Error("CUSTOM_INGREDIENT_IN_USE");
  }

  await db.delete(userCustomIngredients).where(and(
    eq(userCustomIngredients.id, userCustomIngredientId),
    eq(userCustomIngredients.userId, userId)
  ));

  return current;
};

export const addCatalogIngredientToInventory = async (
  userId: string,
  payload: unknown,
  context: InventoryWriteContext = {}
) => {
  const parsed = addCatalogInventoryItemSchema.parse(payload);
  const [catalogItem, rates] = await Promise.all([
    ensureCatalogIngredientExists(parsed.ingredientCatalogItemId),
    listSystemCurrencyRates()
  ]);
  const packageVariant = await ensureCatalogPackageVariant(catalogItem.id, parsed.packageVariantId ?? null);
  const linkage = buildCatalogIngredientLinkage(catalogItem);
  const { profile, category, subtype } = buildCatalogProfile(catalogItem);
  const amount = normalizeMeasurementWithPackageVariant(
    profile,
    parsed.enteredQuantity,
    parsed.enteredUnit,
    packageVariant,
    linkage.technicalData
  );
  const purchase = normalizeInventoryPurchaseContext(profile, parsed, rates, {
    defaultCurrency: context.preferredCurrency ?? null,
    fallbackMeasurement: {
      quantity: amount.enteredQuantity,
      unit: amount.enteredUnit
    }
  });

  const [created] = await db.insert(userIngredients).values({
    userId,
    ingredientCatalogItemId: catalogItem.id,
    userCustomIngredientId: null,
    packageVariantId: packageVariant?.id ?? null,
    ingredientFamilyId: null,
    ingredientCategory: category,
    ingredientSubtype: subtype,
    ingredientDisplayNameSnapshot: linkage.displayName,
    ingredientDefaultDisplayUnitSnapshot: profile.defaultUnit,
    ingredientMeasurementDimension: profile.measurementDimension,
    enteredQuantity: amount.enteredQuantity,
    enteredUnit: amount.enteredUnit,
    normalizedQuantity: amount.normalizedQuantity,
    normalizedUnit: amount.normalizedUnit,
    unitDimension: amount.unitDimension,
    priceInputMode: purchase.priceInputMode,
    priceInputAmountMinor: purchase.priceInputAmountMinor,
    priceInputCurrency: purchase.priceInputCurrency,
    purchasePriceMinor: purchase.purchasePriceMinor,
    purchaseCurrency: purchase.purchaseCurrency,
    purchaseQuantity: purchase.purchaseQuantity,
    purchaseQuantityUnit: purchase.purchaseQuantityUnit,
    purchaseQuantityNormalized: purchase.purchaseQuantityNormalized,
    purchaseQuantityNormalizedUnit: purchase.purchaseQuantityNormalizedUnit,
    normalizedUnitCostMinorRub: purchase.normalizedUnitCostMinorRub,
    purchasedAt: parsed.purchasedAt,
    freshnessDate: parsed.freshnessDate,
    notes: parsed.notes
  }).returning();

  return created;
};

export const addCustomIngredientToInventory = async (
  userId: string,
  payload: unknown,
  context: InventoryWriteContext = {}
) => {
  const parsed = addCustomInventoryItemSchema.parse(payload);
  const [customIngredient, rates] = await Promise.all([
    ensureOwnedCustomIngredient(userId, parsed.userCustomIngredientId),
    listSystemCurrencyRates()
  ]);
  const linkage = buildCustomIngredientLinkage(customIngredient);
  const profile = resolveHumanFacingInventoryUnitProfile({
    type: linkage.type,
    category: linkage.category,
    subtype: linkage.subtype,
    technicalData: linkage.technicalData,
    defaultDisplayUnit: linkage.defaultDisplayUnit,
    allowedUnits: linkage.allowedUnits,
    measurementDimension: linkage.measurementDimension
  });
  const amount = normalizeMeasurementWithPackageVariant(
    profile,
    parsed.enteredQuantity,
    parsed.enteredUnit,
    null,
    linkage.technicalData
  );
  const purchase = normalizeInventoryPurchaseContext(profile, parsed, rates, {
    defaultCurrency: context.preferredCurrency ?? null,
    fallbackMeasurement: {
      quantity: amount.enteredQuantity,
      unit: amount.enteredUnit
    }
  });

  const [created] = await db.insert(userIngredients).values({
    userId,
    ingredientCatalogItemId: null,
    userCustomIngredientId: customIngredient.id,
    packageVariantId: null,
    ingredientFamilyId: null,
    ingredientCategory: linkage.category,
    ingredientSubtype: linkage.subtype,
    ingredientDisplayNameSnapshot: linkage.displayName,
    ingredientDefaultDisplayUnitSnapshot: profile.defaultUnit,
    ingredientMeasurementDimension: profile.measurementDimension,
    enteredQuantity: amount.enteredQuantity,
    enteredUnit: amount.enteredUnit,
    normalizedQuantity: amount.normalizedQuantity,
    normalizedUnit: amount.normalizedUnit,
    unitDimension: amount.unitDimension,
    priceInputMode: purchase.priceInputMode,
    priceInputAmountMinor: purchase.priceInputAmountMinor,
    priceInputCurrency: purchase.priceInputCurrency,
    purchasePriceMinor: purchase.purchasePriceMinor,
    purchaseCurrency: purchase.purchaseCurrency,
    purchaseQuantity: purchase.purchaseQuantity,
    purchaseQuantityUnit: purchase.purchaseQuantityUnit,
    purchaseQuantityNormalized: purchase.purchaseQuantityNormalized,
    purchaseQuantityNormalizedUnit: purchase.purchaseQuantityNormalizedUnit,
    normalizedUnitCostMinorRub: purchase.normalizedUnitCostMinorRub,
    purchasedAt: parsed.purchasedAt,
    freshnessDate: parsed.freshnessDate,
    notes: parsed.notes
  }).returning();

  return created;
};

export const updateInventoryQuantity = async (userId: string, inventoryItemId: string, payload: unknown) => {
  const current = await ensureInventoryItem(userId, inventoryItemId);
  const parsed = updateInventoryQuantitySchema.parse(payload);

  const rows = await db.select({
    inventory: userIngredients,
    catalog: ingredients,
    custom: userCustomIngredients,
    packageVariant: ingredientPackageVariants
  }).from(userIngredients)
    .leftJoin(ingredients, eq(userIngredients.ingredientCatalogItemId, ingredients.id))
    .leftJoin(userCustomIngredients, eq(userIngredients.userCustomIngredientId, userCustomIngredients.id))
    .leftJoin(ingredientPackageVariants, eq(userIngredients.packageVariantId, ingredientPackageVariants.id))
    .where(eq(userIngredients.id, current.id));

  const row = rows[0];
  if (!row) {
    throw new Error("NOT_FOUND");
  }

  const source = resolvePersistedInventorySource(row);
  const profile = resolveHumanFacingInventoryUnitProfile({
    type: source.source.type,
    category: source.source.category ?? null,
    subtype: source.source.subtype ?? null,
    technicalData: source.source.technicalData ?? null,
    defaultDisplayUnit: source.source.defaultDisplayUnit,
    allowedUnits: source.source.allowedUnits,
    measurementDimension: source.source.measurementDimension
  });
  const amount = normalizeMeasurementWithPackageVariant(
    profile,
    parsed.enteredQuantity,
    parsed.enteredUnit,
    row.packageVariant,
    source.source.technicalData ?? null
  );

  const [updated] = await db.update(userIngredients).set({
    enteredQuantity: amount.enteredQuantity,
    enteredUnit: amount.enteredUnit,
    normalizedQuantity: amount.normalizedQuantity,
    normalizedUnit: amount.normalizedUnit,
    unitDimension: amount.unitDimension,
    updatedAt: new Date()
  }).where(eq(userIngredients.id, current.id)).returning();

  return updated;
};

export const setInventoryItemQuantityToZero = async (userId: string, inventoryItemId: string) => {
  await ensureInventoryItem(userId, inventoryItemId);
  await db.update(userIngredients).set({
    enteredQuantity: 0,
    normalizedQuantity: 0,
    updatedAt: new Date()
  }).where(eq(userIngredients.id, inventoryItemId));
};

export const updateInventoryItem = async (
  userId: string,
  inventoryItemId: string,
  payload: unknown,
  context: InventoryWriteContext = {}
) => {
  await ensureInventoryItem(userId, inventoryItemId);
  const parsed = updateInventoryItemSchema.parse(payload);
  ensureSourceLinkage(parsed.ingredientCatalogItemId ?? null, parsed.userCustomIngredientId ?? null);

  if (parsed.ingredientCatalogItemId) {
    const [catalogItem, packageVariant, rates] = await Promise.all([
      ensureCatalogIngredientExists(parsed.ingredientCatalogItemId),
      ensureCatalogPackageVariant(parsed.ingredientCatalogItemId, parsed.packageVariantId ?? null),
      listSystemCurrencyRates()
    ]);
    const { profile, category, subtype } = buildCatalogProfile(catalogItem);
    const linkage = buildCatalogIngredientLinkage(catalogItem);
    const amount = normalizeMeasurementWithPackageVariant(
      profile,
      parsed.enteredQuantity,
      parsed.enteredUnit,
      packageVariant,
      linkage.technicalData
    );
    const purchase = normalizeInventoryPurchaseContext(profile, parsed, rates, {
      defaultCurrency: context.preferredCurrency ?? null,
      fallbackMeasurement: {
        quantity: amount.enteredQuantity,
        unit: amount.enteredUnit
      }
    });

    const [updated] = await db.update(userIngredients).set({
      ingredientCatalogItemId: catalogItem.id,
      userCustomIngredientId: null,
      packageVariantId: packageVariant?.id ?? null,
      ingredientCategory: category,
      ingredientSubtype: subtype,
      ingredientDisplayNameSnapshot: linkage.displayName,
      ingredientDefaultDisplayUnitSnapshot: profile.defaultUnit,
      ingredientMeasurementDimension: profile.measurementDimension,
      enteredQuantity: amount.enteredQuantity,
      enteredUnit: amount.enteredUnit,
      normalizedQuantity: amount.normalizedQuantity,
      normalizedUnit: amount.normalizedUnit,
      unitDimension: amount.unitDimension,
      priceInputMode: purchase.priceInputMode,
      priceInputAmountMinor: purchase.priceInputAmountMinor,
      priceInputCurrency: purchase.priceInputCurrency,
      purchasePriceMinor: purchase.purchasePriceMinor,
      purchaseCurrency: purchase.purchaseCurrency,
      purchaseQuantity: purchase.purchaseQuantity,
      purchaseQuantityUnit: purchase.purchaseQuantityUnit,
      purchaseQuantityNormalized: purchase.purchaseQuantityNormalized,
      purchaseQuantityNormalizedUnit: purchase.purchaseQuantityNormalizedUnit,
      normalizedUnitCostMinorRub: purchase.normalizedUnitCostMinorRub,
      purchasedAt: parsed.purchasedAt,
      freshnessDate: parsed.freshnessDate,
      notes: parsed.notes,
      updatedAt: new Date()
    }).where(eq(userIngredients.id, inventoryItemId)).returning();

    return updated;
  }

  const [customIngredient, rates] = await Promise.all([
    ensureOwnedCustomIngredient(userId, parsed.userCustomIngredientId!),
    listSystemCurrencyRates()
  ]);
  const linkage = buildCustomIngredientLinkage(customIngredient);
  const profile = resolveHumanFacingInventoryUnitProfile({
    type: linkage.type,
    category: linkage.category,
    subtype: linkage.subtype,
    technicalData: linkage.technicalData,
    defaultDisplayUnit: linkage.defaultDisplayUnit,
    allowedUnits: linkage.allowedUnits,
    measurementDimension: linkage.measurementDimension
  });
  const amount = normalizeMeasurementWithPackageVariant(
    profile,
    parsed.enteredQuantity,
    parsed.enteredUnit,
    null,
    linkage.technicalData
  );
  const purchase = normalizeInventoryPurchaseContext(profile, parsed, rates, {
    defaultCurrency: context.preferredCurrency ?? null,
    fallbackMeasurement: {
      quantity: amount.enteredQuantity,
      unit: amount.enteredUnit
    }
  });

  const [updated] = await db.update(userIngredients).set({
    ingredientCatalogItemId: null,
    userCustomIngredientId: customIngredient.id,
    packageVariantId: null,
    ingredientCategory: linkage.category,
    ingredientSubtype: linkage.subtype,
    ingredientDisplayNameSnapshot: linkage.displayName,
    ingredientDefaultDisplayUnitSnapshot: profile.defaultUnit,
    ingredientMeasurementDimension: profile.measurementDimension,
    enteredQuantity: amount.enteredQuantity,
    enteredUnit: amount.enteredUnit,
    normalizedQuantity: amount.normalizedQuantity,
    normalizedUnit: amount.normalizedUnit,
    unitDimension: amount.unitDimension,
    priceInputMode: purchase.priceInputMode,
    priceInputAmountMinor: purchase.priceInputAmountMinor,
    priceInputCurrency: purchase.priceInputCurrency,
    purchasePriceMinor: purchase.purchasePriceMinor,
    purchaseCurrency: purchase.purchaseCurrency,
    purchaseQuantity: purchase.purchaseQuantity,
    purchaseQuantityUnit: purchase.purchaseQuantityUnit,
    purchaseQuantityNormalized: purchase.purchaseQuantityNormalized,
    purchaseQuantityNormalizedUnit: purchase.purchaseQuantityNormalizedUnit,
    normalizedUnitCostMinorRub: purchase.normalizedUnitCostMinorRub,
    purchasedAt: parsed.purchasedAt,
    freshnessDate: parsed.freshnessDate,
    notes: parsed.notes,
    updatedAt: new Date()
  }).where(eq(userIngredients.id, inventoryItemId)).returning();

  return updated;
};

export const archiveInventoryItem = async (userId: string, inventoryItemId: string) => {
  await ensureInventoryItem(userId, inventoryItemId);
  await db.update(userIngredients).set({
    archivedAt: new Date(),
    updatedAt: new Date()
  }).where(eq(userIngredients.id, inventoryItemId));
};

export const deleteInventoryItem = async (userId: string, inventoryItemId: string) => {
  await ensureInventoryItem(userId, inventoryItemId);
  await db.delete(userIngredients).where(eq(userIngredients.id, inventoryItemId));
};

export const listInventoryForUser = async (userId: string, query: unknown = {}) => {
  const parsed = inventoryListQuerySchema.parse(query);

  const rows = await db.select({
    inventory: userIngredients,
    catalog: ingredients,
    custom: userCustomIngredients,
    packageVariant: ingredientPackageVariants
  }).from(userIngredients)
    .leftJoin(ingredients, eq(userIngredients.ingredientCatalogItemId, ingredients.id))
    .leftJoin(userCustomIngredients, eq(userIngredients.userCustomIngredientId, userCustomIngredients.id))
    .leftJoin(ingredientPackageVariants, eq(userIngredients.packageVariantId, ingredientPackageVariants.id))
    .where(and(
      buildInventoryWhere(userId, parsed.includeArchived),
      parsed.category ? eq(userIngredients.ingredientCategory, parsed.category) : undefined,
      buildInventorySearchWhere(parsed.search)
    ));

  let items = rows.map((row) => mapInventoryRow(row));

  if (parsed.type) {
    items = items.filter((item) => item.source.type === parsed.type);
  }

  if (parsed.subtype) {
    items = items.filter((item) => (item.source.subtype ?? item.ingredientSubtype ?? null) === parsed.subtype);
  }

  if (parsed.stockState === "in_stock") {
    items = items.filter((item) => item.normalizedQuantity > 0);
  } else if (parsed.stockState === "empty") {
    items = items.filter((item) => item.normalizedQuantity <= 0);
  } else if (!parsed.includeEmpty) {
    items = items.filter((item) => item.normalizedQuantity > 0);
  }

  items = items.sort((left, right) => {
    if (parsed.sort === "quantity") {
      return right.normalizedQuantity - left.normalizedQuantity;
    }

    if (parsed.sort === "updated") {
      return right.updatedAt.getTime() - left.updatedAt.getTime();
    }

    if (parsed.sort === "best_before") {
      return (left.freshnessDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (right.freshnessDate?.getTime() ?? Number.MAX_SAFE_INTEGER);
    }

    if (parsed.sort === "price") {
      return (right.normalizedUnitCostMinorRub ?? -1) - (left.normalizedUnitCostMinorRub ?? -1);
    }

    return left.source.primaryLabelRu.localeCompare(right.source.primaryLabelRu, "ru");
  });

  return items;
};

export const searchInventorySuggestions = async (
  userId: string,
  query: unknown
) => {
  const base = inventoryListQuerySchema.parse(query);
  const q = String((query as { q?: string }).q ?? "").trim();
  const items = await listInventoryForUser(userId, {
    ...base,
    search: q,
    includeEmpty: base.includeEmpty,
    includeArchived: base.includeArchived
  });

  const limit = Math.max(1, Math.min(20, Number((query as { limit?: number }).limit ?? 10)));
  const deduped = new Map<string, InventoryListItemDto>();

  for (const item of items) {
    const key = `${item.source.sourceKind}:${item.source.sourceId}:${item.packageVariantId ?? ""}`;
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }

  return Array.from(deduped.values())
    .slice(0, limit)
    .map((item) => ({
      id: item.source.sourceId,
      type: item.source.type,
      category: item.source.category,
      subtype: item.source.subtype,
      primaryLabelRu: item.source.primaryLabelRu,
      secondaryLabelRu: item.source.secondaryLabelRu,
      displayName: item.source.displayName,
      subtitle: item.source.summary ?? undefined,
      defaultUnit: item.source.defaultDisplayUnit ?? "g",
      defaultDisplayUnit: item.source.defaultDisplayUnit,
      allowedUnits: item.source.allowedUnits,
      measurementDimension: item.source.measurementDimension,
      source: item.source.sourceKind === "catalog" ? "catalog" as const : "custom" as const
    }));
};

export const getInventorySummaries = async (userId: string): Promise<InventorySummaryDto> => {
  const rows = await db.select({
    archivedAt: userIngredients.archivedAt,
    normalizedQuantity: userIngredients.normalizedQuantity,
    ingredientCategory: userIngredients.ingredientCategory,
    ingredientSubtype: userIngredients.ingredientSubtype
  }).from(userIngredients).where(eq(userIngredients.userId, userId));

  const summary: InventorySummaryDto = {
    totalItems: 0,
    inStockItems: 0,
    emptyItems: 0,
    byCategory: {
      fermentable: 0,
      hop: 0,
      yeast: 0,
      consumable: 0,
      water_treatment: 0
    },
    byFermentableSubtype: {
      malt: 0,
      fermentable: 0
    }
  };

  for (const row of rows) {
    if (row.archivedAt) {
      continue;
    }

    summary.totalItems += 1;
    if (row.normalizedQuantity > 0) {
      summary.inStockItems += 1;
    } else {
      summary.emptyItems += 1;
    }

    const category = row.ingredientCategory;
    if (category && category in summary.byCategory) {
      summary.byCategory[category as keyof typeof summary.byCategory] += 1;
    }

    if (category === "fermentable") {
      if (row.ingredientSubtype === "malt") {
        summary.byFermentableSubtype.malt += 1;
      } else {
        summary.byFermentableSubtype.fermentable += 1;
      }
    }
  }

  return summary;
};
