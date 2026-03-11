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
  updateInventoryQuantitySchema
} from "./contracts";
import { normalizeIngredientName } from "../ingredients/normalization";

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
      normalizedName: row.catalog.normalizedName
    }
    : row.custom
      ? {
        sourceKind: "custom" as const,
        sourceId: row.custom.id,
        type: row.custom.type,
        displayName: row.custom.displayName,
        normalizedName: row.custom.normalizedName
      }
      : null;

  if (!source) {
    throw new Error("INVALID_SOURCE_LINKAGE");
  }

  return {
    id: row.inventory.id,
    quantity: row.inventory.quantity,
    unit: row.inventory.unit,
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
  await ensureCatalogIngredientExists(parsed.ingredientCatalogItemId);

  const [created] = await db.insert(userIngredients).values({
    userId,
    ingredientCatalogItemId: parsed.ingredientCatalogItemId,
    userCustomIngredientId: null,
    quantity: parsed.quantity,
    unit: parsed.unit,
    purchasedAt: parsed.purchasedAt ?? null,
    freshnessDate: parsed.freshnessDate ?? null,
    notes: parsed.notes ?? null
  }).returning();

  return created;
};

export const addCustomIngredientToInventory = async (userId: string, payload: unknown) => {
  const parsed = addCustomInventoryItemSchema.parse(payload);
  ensureSourceLinkage(null, parsed.userCustomIngredientId);
  await ensureOwnedCustomIngredient(userId, parsed.userCustomIngredientId);

  const [created] = await db.insert(userIngredients).values({
    userId,
    ingredientCatalogItemId: null,
    userCustomIngredientId: parsed.userCustomIngredientId,
    quantity: parsed.quantity,
    unit: parsed.unit,
    purchasedAt: parsed.purchasedAt ?? null,
    freshnessDate: parsed.freshnessDate ?? null,
    notes: parsed.notes ?? null
  }).returning();

  return created;
};

export const updateInventoryQuantity = async (userId: string, inventoryItemId: string, payload: unknown) => {
  const parsed = updateInventoryQuantitySchema.parse(payload);
  await ensureOwnedInventoryItem(userId, inventoryItemId);

  const [updated] = await db.update(userIngredients).set({
    quantity: parsed.quantity,
    unit: parsed.unit,
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
      parsed.type ? sql<boolean>`coalesce(${ingredientCatalogItems.type}, ${userCustomIngredients.type}) = ${parsed.type}` : undefined
    ))
    .orderBy(asc(userIngredients.createdAt));

  return rows.map(mapInventoryRow);
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
