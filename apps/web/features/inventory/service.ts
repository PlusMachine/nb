import {
  and,
  asc,
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
import {
  normalizeInventoryMeasurementForProfile,
  parseInventoryUnit,
  resolveInventoryUnitProfile,
  type InventoryUnit,
  type InventoryUnitDimension,
  type InventoryUnitProfile
} from "./units";

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

const buildInventoryTypeWhere = (type?: string) => {
  if (!type) {
    return undefined;
  }

  return sql<boolean>`coalesce(
    ${ingredientCatalogItems.type},
    ${userCustomIngredients.type},
    case
      when ${userIngredients.ingredientCategory} = 'fermentable' then 'fermentable'
      when ${userIngredients.ingredientCategory} = 'hop' then 'hop'
      when ${userIngredients.ingredientCategory} = 'yeast' then 'yeast'
      else 'misc'
    end
  ) = ${type}`;
};

const buildInventorySnapshotUnitProfile = (input: {
  type?: InventorySourceDto["type"] | null;
  category?: InventorySourceDto["category"] | null;
  subtype?: InventorySourceDto["subtype"] | null;
  defaultDisplayUnit?: string | null;
  measurementDimension?: string | null;
  technicalData?: InventorySourceDto["technicalData"];
}) => resolveInventoryUnitProfile({
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

export const addCatalogIngredientToInventory = async (userId: string, payload: unknown) => {
  const parsed = addCatalogInventoryItemSchema.parse(payload);
  ensureSourceLinkage(parsed.ingredientCatalogItemId, null);
  const catalogItem = await ensureCatalogIngredientExists(parsed.ingredientCatalogItemId);
  const linkage = buildCatalogIngredientLinkage(catalogItem);
  const measurement = normalizeInventoryMeasurementForProfile(
    buildPersistedInventoryUnitProfile(buildInventorySnapshotValues(linkage), linkage),
    parsed.enteredQuantity,
    parsed.enteredUnit
  );
  const rates = await listSystemCurrencyRates();
  const purchase = normalizeInventoryPurchaseContext(
    buildPersistedInventoryUnitProfile(buildInventorySnapshotValues(linkage), linkage),
    parsed,
    rates
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

export const addCustomIngredientToInventory = async (userId: string, payload: unknown) => {
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
  const purchase = normalizeInventoryPurchaseContext(unitProfile, parsed, rates);

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

export const updateInventoryItem = async (userId: string, inventoryItemId: string, payload: unknown) => {
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
  const purchase = normalizeInventoryPurchaseContext(unitProfile, parsed, rates);

  const [updated] = await db.update(userIngredients).set({
    ingredientCatalogItemId: parsed.ingredientCatalogItemId ?? null,
    userCustomIngredientId: parsed.userCustomIngredientId ?? null,
    ...buildInventorySnapshotValues(linkage),
    enteredQuantity: measurement.enteredQuantity,
    enteredUnit: measurement.enteredUnit,
    normalizedQuantity: measurement.normalizedQuantity,
    normalizedUnit: measurement.normalizedUnit,
    unitDimension: measurement.unitDimension,
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
      buildInventoryTypeWhere(parsed.type),
      buildInventorySearchWhere(parsed.search)
    ))
    .orderBy(asc(userIngredients.createdAt));

  return rows.map(mapInventoryRow);
};

export const searchInventorySuggestions = async (
  userId: string,
  params: { q: string; type?: string; limit?: number; includeArchived?: boolean }
): Promise<IngredientSuggestionItem[]> => {
  const query = ingredientSearchQuerySchema.parse(params);
  const items = await listInventoryForUser(userId, {
    includeArchived: params.includeArchived ?? false,
    type: query.type,
    search: query.q
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
      catalogType: ingredientCatalogItems.type,
      customType: userCustomIngredients.type,
      ingredientCategory: userIngredients.ingredientCategory,
      ingredientSubtype: userIngredients.ingredientSubtype
    })
    .from(userIngredients)
    .leftJoin(ingredientCatalogItems, eq(userIngredients.ingredientCatalogItemId, ingredientCatalogItems.id))
    .leftJoin(userCustomIngredients, eq(userIngredients.userCustomIngredientId, userCustomIngredients.id))
    .where(eq(userIngredients.userId, userId));

  const summary: InventorySummaryDto = {
    totalItems: rows.length,
    activeItems: 0,
    archivedItems: 0,
    byType: {
      fermentable: 0,
      hop: 0,
      yeast: 0,
      sugar: 0,
      adjunct: 0,
      fining: 0,
      misc: 0
    }
  };

  for (const row of rows) {
    const type = row.catalogType
      ?? row.customType
      ?? resolveLegacyIngredientType({
        category: row.ingredientCategory,
        subtype: row.ingredientSubtype
      });
    if (!type) {
      throw new Error("INVALID_SOURCE_LINKAGE");
    }

    summary.byType[type] += 1;
    if (row.archivedAt) {
      summary.archivedItems += 1;
    } else {
      summary.activeItems += 1;
    }
  }

  return summary;
};
