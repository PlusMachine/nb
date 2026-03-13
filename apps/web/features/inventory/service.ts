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
import { scoreIngredientCandidate } from "../ingredients/ranking";
import { extractIngredientTechnicalFields } from "../ingredients/technical-fields";
import { normalizeInventoryMeasurement, parseInventoryUnit } from "./units";
import type { IngredientType } from "../ingredients/contracts";

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
  return sql<boolean>`coalesce(${ingredientCatalogItems.displayName}, ${userCustomIngredients.displayName}) ilike ${term}`;
};

const mapInventoryRow = (row: {
  inventory: typeof userIngredients.$inferSelect;
  catalog: typeof ingredientCatalogItems.$inferSelect | null;
  custom: typeof userCustomIngredients.$inferSelect | null;
}): InventoryListItemDto => {
  const source = row.catalog
    ? {
      sourceKind: "catalog" as const,
      sourceId: row.catalog.id,
      type: row.catalog.type,
      displayName: row.catalog.displayName,
      normalizedName: row.catalog.normalizedName,
      ...extractIngredientTechnicalFields(row.catalog)
    }
    : row.custom
      ? {
        sourceKind: "custom" as const,
        sourceId: row.custom.id,
        type: row.custom.type,
        displayName: row.custom.displayName,
        normalizedName: row.custom.normalizedName,
        ...extractIngredientTechnicalFields(row.custom)
      }
      : null;

  if (!source) {
    throw new Error("INVALID_SOURCE_LINKAGE");
  }

  const enteredUnit = parseInventoryUnit(row.inventory.enteredUnit);
  const normalizedUnit = parseInventoryUnit(row.inventory.normalizedUnit);
  if (!enteredUnit || !normalizedUnit) {
    throw new Error("INVALID_INVENTORY_UNIT");
  }

  return {
    id: row.inventory.id,
    enteredQuantity: row.inventory.enteredQuantity,
    enteredUnit,
    normalizedQuantity: row.inventory.normalizedQuantity,
    normalizedUnit,
    unitDimension: row.inventory.unitDimension,
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

const buildStoredMeasurement = (ingredientType: IngredientType, payload: { enteredQuantity: number; enteredUnit: string }) => {
  return normalizeInventoryMeasurement(ingredientType, payload.enteredQuantity, payload.enteredUnit);
};

const resolveInventoryIngredientType = async (
  userId: string,
  item: typeof userIngredients.$inferSelect
): Promise<IngredientType> => {
  if (item.ingredientCatalogItemId) {
    const catalogItem = await ensureCatalogIngredientExists(item.ingredientCatalogItemId);
    return catalogItem.type;
  }

  if (item.userCustomIngredientId) {
    const customIngredient = await ensureOwnedCustomIngredient(userId, item.userCustomIngredientId);
    return customIngredient.type;
  }

  throw new Error("INVALID_SOURCE_LINKAGE");
};

export const createUserCustomIngredient = async (userId: string, payload: unknown) => {
  const parsed = createUserCustomIngredientSchema.parse(payload);
  const normalizedName = normalizeIngredientName(parsed.displayName);

  const [created] = await db.insert(userCustomIngredients).values({
    userId,
    type: parsed.type,
    displayName: parsed.displayName,
    normalizedName,
    properties: parsed.properties,
    visibility: parsed.visibility
  }).returning();

  return created;
};

export const addCatalogIngredientToInventory = async (userId: string, payload: unknown) => {
  const parsed = addCatalogInventoryItemSchema.parse(payload);
  ensureSourceLinkage(parsed.ingredientCatalogItemId, null);
  const catalogItem = await ensureCatalogIngredientExists(parsed.ingredientCatalogItemId);
  const measurement = buildStoredMeasurement(catalogItem.type, parsed);

  const [created] = await db.insert(userIngredients).values({
    userId,
    ingredientCatalogItemId: parsed.ingredientCatalogItemId,
    userCustomIngredientId: null,
    enteredQuantity: measurement.enteredQuantity,
    enteredUnit: measurement.enteredUnit,
    normalizedQuantity: measurement.normalizedQuantity,
    normalizedUnit: measurement.normalizedUnit,
    unitDimension: measurement.unitDimension,
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
  const measurement = buildStoredMeasurement(customIngredient.type, parsed);

  const [created] = await db.insert(userIngredients).values({
    userId,
    ingredientCatalogItemId: null,
    userCustomIngredientId: parsed.userCustomIngredientId,
    enteredQuantity: measurement.enteredQuantity,
    enteredUnit: measurement.enteredUnit,
    normalizedQuantity: measurement.normalizedQuantity,
    normalizedUnit: measurement.normalizedUnit,
    unitDimension: measurement.unitDimension,
    purchasedAt: parsed.purchasedAt ?? null,
    freshnessDate: parsed.freshnessDate ?? null,
    notes: parsed.notes ?? null
  }).returning();

  return created;
};

export const updateInventoryQuantity = async (userId: string, inventoryItemId: string, payload: unknown) => {
  const parsed = updateInventoryQuantitySchema.parse(payload);
  const inventoryItem = await ensureOwnedInventoryItem(userId, inventoryItemId);
  const ingredientType = await resolveInventoryIngredientType(userId, inventoryItem);
  const measurement = buildStoredMeasurement(ingredientType, parsed);

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

  let ingredientType: IngredientType;

  if (parsed.ingredientCatalogItemId) {
    const catalogItem = await ensureCatalogIngredientExists(parsed.ingredientCatalogItemId);
    ingredientType = catalogItem.type;
  } else if (parsed.userCustomIngredientId) {
    const customIngredient = await ensureOwnedCustomIngredient(userId, parsed.userCustomIngredientId);
    ingredientType = customIngredient.type;
  } else {
    throw new Error("INVALID_SOURCE_LINKAGE");
  }

  const measurement = buildStoredMeasurement(ingredientType, parsed);

  const [updated] = await db.update(userIngredients).set({
    ingredientCatalogItemId: parsed.ingredientCatalogItemId ?? null,
    userCustomIngredientId: parsed.userCustomIngredientId ?? null,
    enteredQuantity: measurement.enteredQuantity,
    enteredUnit: measurement.enteredUnit,
    normalizedQuantity: measurement.normalizedQuantity,
    normalizedUnit: measurement.normalizedUnit,
    unitDimension: measurement.unitDimension,
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
      parsed.type ? sql<boolean>`coalesce(${ingredientCatalogItems.type}, ${userCustomIngredients.type}) = ${parsed.type}` : undefined,
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
      displayName: item.source.displayName,
      subtitle: `${item.source.sourceKind === "catalog" ? "каталог" : "свой"} · ${positionsCount} поз. в запасах`,
      defaultUnit: item.enteredUnit,
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
      customType: userCustomIngredients.type
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
    const type = row.catalogType ?? row.customType;
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
