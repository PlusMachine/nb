import {
  and,
  db,
  eq,
  ingredientCatalogItems,
  isNull,
  sql,
  userCustomIngredients,
  userIngredients
} from "@nb/db";

import {
  addCatalogInventoryItemSchema,
  addCustomInventoryItemSchema,
  createUserCustomIngredientSchema,
  inventorySourceLinkageSchema,
  inventoryListQuerySchema,
  type InventoryListItemDto,
  type InventorySummaryDto,
  type InventorySourceDto,
  updateInventoryItemSchema,
  updateInventoryQuantitySchema
} from "./contracts";
import { ingredientSearchQuerySchema, type IngredientSuggestionItem } from "../ingredients/contracts";
import { normalizeIngredientName } from "../ingredients/normalization";
import { buildIngredientTypedSummary } from "../ingredients/presentation";
import { scoreIngredientCandidate } from "../ingredients/ranking";
import {
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
import { resolveInventoryMeasurementForDisplay } from "./display";
import {
  normalizeInventoryMeasurementForProfile,
  parseInventoryUnit,
  resolveHumanFacingInventoryUnitProfile,
  resolveInventoryUnitProfile,
  type InventoryUnit,
  type InventoryUnitDimension,
  type InventoryUnitProfile
} from "./units";

type InventoryWriteContext = {
  preferredCurrency?: SystemCurrency | null;
};

type InventorySortDirection = "asc" | "desc";

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
  return sql<boolean>`coalesce(${userIngredients.ingredientDisplayNameSnapshot}, ${ingredientCatalogItems.displayName}, ${userCustomIngredients.displayName}) ilike ${term}`;
};

const buildInventorySnapshotUnitProfile = (input: {
  type?: InventorySourceDto["type"] | null;
  category?: InventorySourceDto["category"] | null;
  subtype?: InventorySourceDto["subtype"] | null;
  defaultDisplayUnit?: string | null;
  measurementDimension?: string | null;
  technicalData?: InventorySourceDto["technicalData"];
}) => resolveHumanFacingInventoryUnitProfile({
  type: input.type,
  category: input.category,
  subtype: input.subtype,
  defaultDisplayUnit: input.defaultDisplayUnit,
  measurementDimension: input.measurementDimension,
  technicalData: input.technicalData ?? null
});

const buildLiveInventoryLinkage = (
  catalog: typeof ingredientCatalogItems.$inferSelect | null,
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
    category: inventory.ingredientCategory,
    subtype: inventory.ingredientSubtype
  })
  ?? liveLinkage?.type
  ?? "misc"
);

const resolveSnapshotDisplayName = (
  inventory: typeof userIngredients.$inferSelect,
  liveLinkage: IngredientSourceLinkage | null
) => inventory.ingredientDisplayNameSnapshot
  ?? liveLinkage?.displayName
  ?? null;

const resolvePersistedInventorySource = (row: {
  inventory: typeof userIngredients.$inferSelect;
  catalog: typeof ingredientCatalogItems.$inferSelect | null;
  custom: typeof userCustomIngredients.$inferSelect | null;
}) => {
  const liveLinkage = buildLiveInventoryLinkage(row.catalog, row.custom);
  const type = resolveSnapshotType(row.inventory, liveLinkage);
  const category = row.inventory.ingredientCategory ?? liveLinkage?.category ?? resolveIngredientCategory({ type });
  const subtype = row.inventory.ingredientSubtype as InventorySourceDto["subtype"] ?? liveLinkage?.subtype ?? null;
  const displayName = resolveSnapshotDisplayName(row.inventory, liveLinkage);

  if (!displayName) {
    throw new Error("INVALID_SOURCE_LINKAGE");
  }

  const unitProfile = buildInventorySnapshotUnitProfile({
    type,
    category,
    subtype,
    defaultDisplayUnit: row.inventory.ingredientDefaultDisplayUnitSnapshot ?? liveLinkage?.defaultDisplayUnit ?? null,
    measurementDimension: row.inventory.ingredientMeasurementDimension ?? liveLinkage?.measurementDimension ?? null,
    technicalData: liveLinkage?.technicalData ?? null
  });

  const sourceKind = row.inventory.userCustomIngredientId != null
    ? "custom"
    : "catalog";
  const sourceId = row.inventory.userCustomIngredientId
    ?? row.inventory.ingredientCatalogItemId
    ?? row.custom?.id
    ?? row.catalog?.id
    ?? row.inventory.id;

  const summary = buildIngredientTypedSummary({
    category,
    subtype,
    displayName,
    defaultDisplayUnit: unitProfile.defaultUnit,
    technicalData: liveLinkage?.technicalData ?? null
  }) ?? liveLinkage?.summary ?? null;

  return {
    source: {
      sourceKind,
      sourceId,
      type,
      category,
      subtype,
      familyId: row.inventory.ingredientFamilyId ?? liveLinkage?.familyId ?? null,
      familyDisplayName: liveLinkage?.familyDisplayName ?? null,
      displayName,
      normalizedName: row.catalog?.normalizedName ?? row.custom?.normalizedName ?? normalizeIngredientName(displayName),
      brandName: row.catalog?.brandName ?? row.custom?.manufacturer ?? null,
      completenessLevel: row.catalog?.completenessLevel ?? null,
      technicalData: liveLinkage?.technicalData ?? null,
      defaultDisplayUnit: unitProfile.defaultUnit,
      allowedUnits: unitProfile.allowedUnits,
      measurementDimension: row.inventory.ingredientMeasurementDimension ?? unitProfile.measurementDimension,
      summary,
      ...(row.catalog || row.custom ? extractIngredientTechnicalFields(row.catalog ?? row.custom!) : {})
    } satisfies InventorySourceDto,
    snapshot: {
      ingredientCatalogItemId: row.inventory.ingredientCatalogItemId ?? null,
      userCustomIngredientId: row.inventory.userCustomIngredientId ?? null,
      ingredientFamilyId: row.inventory.ingredientFamilyId ?? liveLinkage?.familyId ?? null,
      ingredientCategory: category,
      ingredientSubtype: subtype,
      ingredientDisplayNameSnapshot: displayName,
      ingredientDefaultDisplayUnitSnapshot: unitProfile.defaultUnit,
      ingredientMeasurementDimension: row.inventory.ingredientMeasurementDimension ?? unitProfile.measurementDimension
    }
  };
};

const mapInventoryRow = (row: {
  inventory: typeof userIngredients.$inferSelect;
  catalog: typeof ingredientCatalogItems.$inferSelect | null;
  custom: typeof userCustomIngredients.$inferSelect | null;
}): InventoryListItemDto => {
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
    source: source satisfies InventorySourceDto
  };
};

const ensureCatalogIngredientExists = async (ingredientCatalogItemId: string) => {
  const catalogItem = await db.query.ingredientCatalogItems.findFirst({
    where: and(
      eq(ingredientCatalogItems.id, ingredientCatalogItemId),
      eq(ingredientCatalogItems.status, "active")
    )
  });

  if (!catalogItem) {
    throw new Error("CATALOG_INGREDIENT_NOT_FOUND");
  }

  return catalogItem;
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

const ensureOwnedInventoryItem = async (userId: string, inventoryItemId: string) => {
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

const buildInventorySnapshotValues = (linkage: IngredientSourceLinkage) => ({
  ingredientFamilyId: linkage.familyId,
  ingredientCategory: linkage.category,
  ingredientSubtype: linkage.subtype,
  ingredientDisplayNameSnapshot: linkage.displayName,
  ingredientDefaultDisplayUnitSnapshot: linkage.defaultDisplayUnit,
  ingredientMeasurementDimension: linkage.measurementDimension
});

const buildPersistedInventoryUnitProfile = (
  item: Pick<
    typeof userIngredients.$inferSelect,
    "ingredientCategory" | "ingredientSubtype" | "ingredientDisplayNameSnapshot" | "ingredientDefaultDisplayUnitSnapshot" | "ingredientMeasurementDimension"
  >,
  liveLinkage?: IngredientSourceLinkage | null
): InventoryUnitProfile => buildInventorySnapshotUnitProfile({
  type: resolveLegacyIngredientType({
    category: item.ingredientCategory,
    subtype: item.ingredientSubtype
  }),
  category: item.ingredientCategory,
  subtype: item.ingredientSubtype as InventorySourceDto["subtype"],
  defaultDisplayUnit: item.ingredientDefaultDisplayUnitSnapshot ?? liveLinkage?.defaultDisplayUnit ?? null,
  measurementDimension: item.ingredientMeasurementDimension ?? liveLinkage?.measurementDimension ?? null,
  technicalData: liveLinkage?.technicalData ?? null
});

const resolveInventoryQueryCategory = (
  query: Pick<
    ReturnType<typeof inventoryListQuerySchema.parse>,
    "category" | "type"
  >
) => (
  query.category
  ?? (query.type ? resolveIngredientCategory({ type: query.type }) : undefined)
);

const isInventoryItemEmpty = (item: InventoryListItemDto) => item.normalizedQuantity <= 0;

const applyInventoryStockState = (
  items: InventoryListItemDto[],
  stockState: ReturnType<typeof inventoryListQuerySchema.parse>["stockState"]
) => {
  if (stockState === "all") {
    return items;
  }

  return items.filter((item) => (
    stockState === "empty"
      ? isInventoryItemEmpty(item)
      : !isInventoryItemEmpty(item)
  ));
};

const resolveInventoryStockState = (
  query: Pick<
    ReturnType<typeof inventoryListQuerySchema.parse>,
    "includeEmpty" | "stockState"
  >
) => {
  if (query.stockState === "all" || query.stockState === "empty") {
    return query.stockState;
  }

  return query.includeEmpty ? "all" : "in_stock";
};

const compareNullableNumber = (
  left: number | null | undefined,
  right: number | null | undefined,
  direction: InventorySortDirection = "asc"
) => {
  if (left == null && right == null) {
    return 0;
  }

  if (left == null) {
    return 1;
  }

  if (right == null) {
    return -1;
  }

  return direction === "asc" ? left - right : right - left;
};

const compareNullableDate = (
  left: Date | null | undefined,
  right: Date | null | undefined,
  direction: InventorySortDirection = "asc"
) => compareNullableNumber(left?.getTime(), right?.getTime(), direction);

const compareInventoryItems = (
  left: InventoryListItemDto,
  right: InventoryListItemDto,
  sort: ReturnType<typeof inventoryListQuerySchema.parse>["sort"]
) => {
  if (sort === "name") {
    return left.source.displayName.localeCompare(right.source.displayName, "ru");
  }

  if (sort === "quantity") {
    const quantityComparison = compareNullableNumber(left.normalizedQuantity, right.normalizedQuantity, "desc");
    if (quantityComparison !== 0) {
      return quantityComparison;
    }
  }

  if (sort === "updated") {
    const updatedComparison = compareNullableDate(left.updatedAt, right.updatedAt, "desc");
    if (updatedComparison !== 0) {
      return updatedComparison;
    }
  }

  if (sort === "best_before") {
    const freshnessComparison = compareNullableDate(left.freshnessDate, right.freshnessDate, "asc");
    if (freshnessComparison !== 0) {
      return freshnessComparison;
    }
  }

  if (sort === "price") {
    const priceComparison = compareNullableNumber(left.normalizedUnitCostMinorRub, right.normalizedUnitCostMinorRub, "asc");
    if (priceComparison !== 0) {
      return priceComparison;
    }
  }

  const updatedFallback = compareNullableDate(left.updatedAt, right.updatedAt, "desc");
  if (updatedFallback !== 0) {
    return updatedFallback;
  }

  return left.source.displayName.localeCompare(right.source.displayName, "ru");
};

const resolveInventoryIngredientProfile = async (
  userId: string,
  item: typeof userIngredients.$inferSelect
) => {
  if (item.ingredientCatalogItemId) {
    const catalogItem = await ensureCatalogIngredientExists(item.ingredientCatalogItemId);
    return buildPersistedInventoryUnitProfile(item, buildCatalogIngredientLinkage(catalogItem));
  }

  if (item.userCustomIngredientId) {
    const customIngredient = await ensureOwnedCustomIngredient(userId, item.userCustomIngredientId);
    return buildPersistedInventoryUnitProfile(item, buildCustomIngredientLinkage(customIngredient));
  }

  return buildPersistedInventoryUnitProfile(item, null);
};

export const createUserCustomIngredient = async (userId: string, payload: unknown) => {
  const parsed = createUserCustomIngredientSchema.parse(payload);
  const normalizedName = normalizeIngredientName(parsed.displayName);
  const category = resolveIngredientCategory(parsed);
  const subtype = resolveIngredientSubtype(parsed);
  const type = resolveLegacyIngredientType(parsed);
  const unitProfile = resolveInventoryUnitProfile({
    type,
    category,
    subtype,
    defaultDisplayUnit: parsed.defaultDisplayUnit ?? undefined
  });
  const properties = {
    ...parsed.properties,
    taxonomyCategory: category,
    taxonomySubtype: subtype,
    defaultDisplayUnit: unitProfile.defaultUnit,
    allowedUnits: unitProfile.allowedUnits,
    measurementDimension: unitProfile.measurementDimension
  };

  const [created] = await db.insert(userCustomIngredients).values({
    userId,
    type,
    displayName: parsed.displayName,
    normalizedName,
    properties,
    visibility: parsed.visibility
  }).returning();

  return created;
};

export const addCatalogIngredientToInventory = async (
  userId: string,
  payload: unknown,
  context: InventoryWriteContext = {}
) => {
  const parsed = addCatalogInventoryItemSchema.parse(payload);
  ensureSourceLinkage(parsed.ingredientCatalogItemId, null);
  const catalogItem = await ensureCatalogIngredientExists(parsed.ingredientCatalogItemId);
  const linkage = buildCatalogIngredientLinkage(catalogItem);
  const unitProfile = buildPersistedInventoryUnitProfile(buildInventorySnapshotValues(linkage), linkage);
  const measurement = normalizeInventoryMeasurementForProfile(
    unitProfile,
    parsed.enteredQuantity,
    parsed.enteredUnit
  );
  const rates = await listSystemCurrencyRates();
  const purchase = normalizeInventoryPurchaseContext(
    unitProfile,
    parsed,
    rates,
    {
      defaultCurrency: context.preferredCurrency ?? "RUB",
      fallbackMeasurement: {
        quantity: measurement.enteredQuantity,
        unit: measurement.enteredUnit
      },
      displayMeasurement: resolveInventoryMeasurementForDisplay({
        enteredQuantity: measurement.enteredQuantity,
        enteredUnit: measurement.enteredUnit,
        normalizedQuantity: measurement.normalizedQuantity,
        normalizedUnit: measurement.normalizedUnit,
        type: linkage.type,
        category: linkage.category,
        subtype: linkage.subtype,
        defaultDisplayUnit: linkage.defaultDisplayUnit,
        allowedUnits: linkage.allowedUnits,
        measurementDimension: linkage.measurementDimension,
        technicalData: linkage.technicalData
      })
    }
  );

  const [created] = await db.insert(userIngredients).values({
    userId,
    ingredientCatalogItemId: parsed.ingredientCatalogItemId,
    userCustomIngredientId: null,
    ...buildInventorySnapshotValues(linkage),
    enteredQuantity: measurement.enteredQuantity,
    enteredUnit: measurement.enteredUnit,
    normalizedQuantity: measurement.normalizedQuantity,
    normalizedUnit: measurement.normalizedUnit,
    unitDimension: measurement.unitDimension,
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
    purchasedAt: parsed.purchasedAt ?? null,
    freshnessDate: parsed.freshnessDate ?? null,
    notes: parsed.notes ?? null
  }).returning();

  return created;
};

export const addCustomIngredientToInventory = async (
  userId: string,
  payload: unknown,
  context: InventoryWriteContext = {}
) => {
  const parsed = addCustomInventoryItemSchema.parse(payload);
  ensureSourceLinkage(null, parsed.userCustomIngredientId);
  const customIngredient = await ensureOwnedCustomIngredient(userId, parsed.userCustomIngredientId);
  const linkage = buildCustomIngredientLinkage(customIngredient);
  const unitProfile = buildPersistedInventoryUnitProfile(buildInventorySnapshotValues(linkage), linkage);
  const measurement = normalizeInventoryMeasurementForProfile(
    unitProfile,
    parsed.enteredQuantity,
    parsed.enteredUnit
  );
  const rates = await listSystemCurrencyRates();
  const purchase = normalizeInventoryPurchaseContext(unitProfile, parsed, rates, {
    defaultCurrency: context.preferredCurrency ?? "RUB",
    fallbackMeasurement: {
      quantity: measurement.enteredQuantity,
      unit: measurement.enteredUnit
    },
    displayMeasurement: resolveInventoryMeasurementForDisplay({
      enteredQuantity: measurement.enteredQuantity,
      enteredUnit: measurement.enteredUnit,
      normalizedQuantity: measurement.normalizedQuantity,
      normalizedUnit: measurement.normalizedUnit,
      type: linkage.type,
      category: linkage.category,
      subtype: linkage.subtype,
      defaultDisplayUnit: linkage.defaultDisplayUnit,
      allowedUnits: linkage.allowedUnits,
      measurementDimension: linkage.measurementDimension,
      technicalData: linkage.technicalData
    })
  });

  const [created] = await db.insert(userIngredients).values({
    userId,
    ingredientCatalogItemId: null,
    userCustomIngredientId: parsed.userCustomIngredientId,
    ...buildInventorySnapshotValues(linkage),
    enteredQuantity: measurement.enteredQuantity,
    enteredUnit: measurement.enteredUnit,
    normalizedQuantity: measurement.normalizedQuantity,
    normalizedUnit: measurement.normalizedUnit,
    unitDimension: measurement.unitDimension,
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
    purchasedAt: parsed.purchasedAt ?? null,
    freshnessDate: parsed.freshnessDate ?? null,
    notes: parsed.notes ?? null
  }).returning();

  return created;
};

export const updateInventoryQuantity = async (userId: string, inventoryItemId: string, payload: unknown) => {
  const parsed = updateInventoryQuantitySchema.parse(payload);
  const inventoryItem = await ensureOwnedInventoryItem(userId, inventoryItemId);
  const unitProfile = await resolveInventoryIngredientProfile(userId, inventoryItem);
  const measurement = normalizeInventoryMeasurementForProfile(unitProfile, parsed.enteredQuantity, parsed.enteredUnit);

  const [updated] = await db.update(userIngredients).set({
    enteredQuantity: measurement.enteredQuantity,
    enteredUnit: measurement.enteredUnit,
    normalizedQuantity: measurement.normalizedQuantity,
    normalizedUnit: measurement.normalizedUnit,
    unitDimension: measurement.unitDimension,
    updatedAt: new Date()
  }).where(eq(userIngredients.id, inventoryItemId)).returning();

  return updated ?? null;
};

export const setInventoryItemQuantityToZero = async (userId: string, inventoryItemId: string) => {
  const inventoryItem = await ensureOwnedInventoryItem(userId, inventoryItemId);
  const updated = await updateInventoryQuantity(userId, inventoryItemId, {
    enteredQuantity: 0,
    enteredUnit: inventoryItem.enteredUnit
  });

  return updated ?? inventoryItem;
};

export const updateInventoryItem = async (
  userId: string,
  inventoryItemId: string,
  payload: unknown,
  context: InventoryWriteContext = {}
) => {
  const parsed = updateInventoryItemSchema.parse(payload);
  await ensureOwnedInventoryItem(userId, inventoryItemId);

  let linkage: IngredientSourceLinkage;

  if (parsed.ingredientCatalogItemId) {
    const catalogItem = await ensureCatalogIngredientExists(parsed.ingredientCatalogItemId);
    linkage = buildCatalogIngredientLinkage(catalogItem);
  } else if (parsed.userCustomIngredientId) {
    const customIngredient = await ensureOwnedCustomIngredient(userId, parsed.userCustomIngredientId);
    linkage = buildCustomIngredientLinkage(customIngredient);
  } else {
    throw new Error("INVALID_SOURCE_LINKAGE");
  }

  const unitProfile = buildPersistedInventoryUnitProfile(buildInventorySnapshotValues(linkage), linkage);
  const measurement = normalizeInventoryMeasurementForProfile(unitProfile, parsed.enteredQuantity, parsed.enteredUnit);
  const rates = await listSystemCurrencyRates();
  const purchase = normalizeInventoryPurchaseContext(unitProfile, parsed, rates, {
    defaultCurrency: context.preferredCurrency ?? "RUB",
    fallbackMeasurement: {
      quantity: measurement.enteredQuantity,
      unit: measurement.enteredUnit
    },
    displayMeasurement: resolveInventoryMeasurementForDisplay({
      enteredQuantity: measurement.enteredQuantity,
      enteredUnit: measurement.enteredUnit,
      normalizedQuantity: measurement.normalizedQuantity,
      normalizedUnit: measurement.normalizedUnit,
      type: linkage.type,
      category: linkage.category,
      subtype: linkage.subtype,
      defaultDisplayUnit: linkage.defaultDisplayUnit,
      allowedUnits: linkage.allowedUnits,
      measurementDimension: linkage.measurementDimension,
      technicalData: linkage.technicalData
    })
  });

  const [updated] = await db.update(userIngredients).set({
    ingredientCatalogItemId: parsed.ingredientCatalogItemId ?? null,
    userCustomIngredientId: parsed.userCustomIngredientId ?? null,
    ...buildInventorySnapshotValues(linkage),
    enteredQuantity: measurement.enteredQuantity,
    enteredUnit: measurement.enteredUnit,
    normalizedQuantity: measurement.normalizedQuantity,
    normalizedUnit: measurement.normalizedUnit,
    unitDimension: measurement.unitDimension,
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
    purchasedAt: parsed.purchasedAt ?? null,
    freshnessDate: parsed.freshnessDate ?? null,
    notes: parsed.notes ?? null,
    updatedAt: new Date()
  }).where(eq(userIngredients.id, inventoryItemId)).returning();

  return updated ?? null;
};

export const archiveInventoryItem = async (userId: string, inventoryItemId: string) => {
  await ensureOwnedInventoryItem(userId, inventoryItemId);

  const [updated] = await db.update(userIngredients).set({
    archivedAt: new Date(),
    updatedAt: new Date()
  }).where(eq(userIngredients.id, inventoryItemId)).returning();

  return updated ?? null;
};

export const deleteInventoryItem = async (userId: string, inventoryItemId: string) => {
  await ensureOwnedInventoryItem(userId, inventoryItemId);
  await db.delete(userIngredients).where(eq(userIngredients.id, inventoryItemId));
};

export const listInventoryForUser = async (userId: string, query: unknown = {}) => {
  const parsed = inventoryListQuerySchema.parse(query);
  const category = resolveInventoryQueryCategory(parsed);
  const stockState = resolveInventoryStockState(parsed);

  const rows = await db
    .select({
      inventory: userIngredients,
      catalog: ingredientCatalogItems,
      custom: userCustomIngredients
    })
    .from(userIngredients)
    .leftJoin(ingredientCatalogItems, eq(userIngredients.ingredientCatalogItemId, ingredientCatalogItems.id))
    .leftJoin(userCustomIngredients, eq(userIngredients.userCustomIngredientId, userCustomIngredients.id))
    .where(and(
      buildInventoryWhere(userId, parsed.includeArchived),
      buildInventorySearchWhere(parsed.search)
    ));

  const items = rows
    .map(mapInventoryRow)
    .filter((item) => (category ? item.ingredientCategory === category : true));

  return applyInventoryStockState(items, stockState)
    .sort((left, right) => compareInventoryItems(left, right, parsed.sort));
};

export const searchInventorySuggestions = async (
  userId: string,
  params: {
    q: string;
    type?: string;
    category?: string;
    includeEmpty?: boolean;
    stockState?: "in_stock" | "empty" | "all";
    limit?: number;
    includeArchived?: boolean;
  }
): Promise<IngredientSuggestionItem[]> => {
  const query = ingredientSearchQuerySchema.parse(params);
  const listQuery = inventoryListQuerySchema.parse({
    includeArchived: params.includeArchived ?? false,
    includeEmpty: params.includeEmpty ?? false,
    category: params.category ?? query.category,
    type: query.type,
    stockState: params.stockState ?? "in_stock",
    search: query.q
  });
  const items = await listInventoryForUser(userId, {
    includeArchived: listQuery.includeArchived,
    includeEmpty: listQuery.includeEmpty,
    category: listQuery.category,
    type: listQuery.type,
    stockState: listQuery.stockState,
    search: listQuery.search
  });

  const grouped = new Map<string, { item: InventoryListItemDto; positionsCount: number }>();

  for (const item of items) {
    const key = `${item.source.sourceKind}:${item.source.sourceId}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.positionsCount += 1;
    } else {
      grouped.set(key, { item, positionsCount: 1 });
    }
  }

  return [...grouped.values()]
    .map(({ item, positionsCount }) => ({
      id: item.source.sourceId,
      type: item.source.type,
      category: item.source.category,
      subtype: item.source.subtype,
      familyId: item.source.familyId,
      familyDisplayName: item.source.familyDisplayName ?? undefined,
      displayName: item.source.displayName,
      subtitle: [item.source.summary, `${positionsCount} поз. в запасах`].filter(Boolean).join(" • "),
      brandName: item.source.brandName ?? undefined,
      defaultUnit: item.source.defaultDisplayUnit ?? item.enteredUnit,
      defaultDisplayUnit: item.source.defaultDisplayUnit ?? item.enteredUnit,
      allowedUnits: item.source.allowedUnits,
      measurementDimension: item.source.measurementDimension ?? item.unitDimension,
      completenessLevel: item.source.completenessLevel ?? undefined,
      source: item.source.sourceKind === "catalog" ? "catalog" as const : "custom" as const,
      rankScore: scoreIngredientCandidate(query.q, {
        displayName: item.source.displayName,
        normalizedName: item.source.normalizedName,
        aliases: []
      }) + positionsCount
    }))
    .sort((a, b) => b.rankScore - a.rankScore || a.displayName.localeCompare(b.displayName))
    .slice(0, query.limit)
    .map(({ rankScore, ...item }) => item);
};

export const getInventorySummaries = async (userId: string): Promise<InventorySummaryDto> => {
  const rows = await db
    .select({
      archivedAt: userIngredients.archivedAt,
      normalizedQuantity: userIngredients.normalizedQuantity,
      catalogType: ingredientCatalogItems.type,
      customType: userCustomIngredients.type,
      ingredientCategory: userIngredients.ingredientCategory,
      ingredientSubtype: userIngredients.ingredientSubtype
    })
    .from(userIngredients)
    .leftJoin(ingredientCatalogItems, eq(userIngredients.ingredientCatalogItemId, ingredientCatalogItems.id))
    .leftJoin(userCustomIngredients, eq(userIngredients.userCustomIngredientId, userCustomIngredients.id))
    .where(and(
      eq(userIngredients.userId, userId),
      isNull(userIngredients.archivedAt)
    ));

  const summary: InventorySummaryDto = {
    totalItems: rows.length,
    inStockItems: 0,
    emptyItems: 0,
    byCategory: {
      fermentable: 0,
      hop: 0,
      yeast: 0,
      water_prep: 0,
      misc: 0
    }
  };

  for (const row of rows) {
    const category = row.ingredientCategory
      ?? resolveIngredientCategory({
        type: row.catalogType ?? row.customType ?? undefined,
        subtype: row.ingredientSubtype
      });
    if (!category) {
      throw new Error("INVALID_SOURCE_LINKAGE");
    }

    summary.byCategory[category] += 1;
    if ((row.normalizedQuantity ?? 0) > 0) {
      summary.inStockItems += 1;
    } else {
      summary.emptyItems += 1;
    }
  }

  return summary;
};
