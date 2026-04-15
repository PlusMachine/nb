import {
  and,
  db,
  eq,
  inArray,
  inventoryTransactions,
  recipeIngredients,
  recipeInventoryAllocations,
  recipes,
  userIngredients
} from "@nb/db";
import { convertVolume, convertWeight, roundTo } from "@nb/brewing-core";

import {
  type RecipeStockCoverageDto,
  type RecipeStockCoverageLineDto
} from "./contracts";
import { parseInventoryUnit, type InventoryUnit } from "../inventory/units";

const activeAllocationStatuses = ["allocated", "reserved"] as const;
const visibleAllocationStatuses = ["allocated", "reserved", "consumed", "released"] as const;

const ensureOwnedRecipe = async (userId: string, recipeId: string) => {
  const recipe = await db.query.recipes.findFirst({
    where: and(eq(recipes.id, recipeId), eq(recipes.authorId, userId))
  });

  if (!recipe) {
    throw new Error("NOT_FOUND");
  }

  return recipe;
};

const ensureOwnedInventoryItem = async (userId: string, inventoryItemId: string) => {
  const item = await db.query.userIngredients.findFirst({
    where: and(eq(userIngredients.id, inventoryItemId), eq(userIngredients.userId, userId))
  });

  if (!item) {
    throw new Error("NOT_FOUND");
  }

  return item;
};

const parseUnitOrThrow = (unit: string): InventoryUnit => {
  const parsed = parseInventoryUnit(unit);
  if (!parsed) {
    throw new Error("INVALID_UNIT");
  }

  return parsed;
};

const readInventoryItemIdFromMeta = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const maybeId = (value as { inventoryItemId?: unknown }).inventoryItemId;
  return typeof maybeId === "string" && maybeId.trim() ? maybeId : null;
};

const assertInventorySourceMatchesRecipeLine = (
  line: typeof recipeIngredients.$inferSelect,
  inventoryItem: typeof userIngredients.$inferSelect
) => {
  const catalogMatches = line.ingredientCatalogItemId
    && inventoryItem.ingredientCatalogItemId
    && line.ingredientCatalogItemId === inventoryItem.ingredientCatalogItemId;
  const customMatches = line.userCustomIngredientId
    && inventoryItem.userCustomIngredientId
    && line.userCustomIngredientId === inventoryItem.userCustomIngredientId;

  if (!catalogMatches && !customMatches) {
    throw new Error("INCOMPATIBLE_INVENTORY_SOURCE");
  }

  if (line.amountNormalizedUnit !== inventoryItem.normalizedUnit) {
    throw new Error("INCOMPATIBLE_UNIT");
  }
};

const allocationStatusRank = (status: string) => {
  if (status === "reserved") return 5;
  if (status === "allocated") return 4;
  if (status === "consumed") return 3;
  if (status === "released") return 2;
  return 0;
};

const buildCoverageSummary = (lines: RecipeStockCoverageLineDto[]): RecipeStockCoverageDto["summary"] => ({
  totalLines: lines.length,
  selectedLines: lines.filter((line) => Boolean(line.inventoryItemId)).length,
  coveredLines: lines.filter((line) => line.status === "covered").length,
  reservedLines: lines.filter((line) => line.status === "reserved").length,
  consumedLines: lines.filter((line) => line.status === "consumed").length,
  shortLines: lines.filter((line) => line.status === "short").length
});

const resolveCoverageStatus = (input: {
  allocationStatus?: string | null;
  allocatedQuantityNormalized: number;
  requiredQuantityNormalized: number;
  availableQuantityNormalized: number | null;
}): RecipeStockCoverageLineDto["status"] => {
  if (input.allocationStatus === "reserved") return "reserved";
  if (input.allocationStatus === "consumed") return "consumed";
  if (input.allocationStatus === "released") return "released";
  if (input.allocatedQuantityNormalized <= 0) return "unselected";
  if (input.availableQuantityNormalized != null && input.availableQuantityNormalized < input.requiredQuantityNormalized) return "short";
  return input.allocatedQuantityNormalized >= input.requiredQuantityNormalized ? "covered" : "short";
};

export const listRecipeStockCoverage = async (
  userId: string,
  recipeId: string
): Promise<RecipeStockCoverageDto> => {
  await ensureOwnedRecipe(userId, recipeId);
  const [lines, allocations] = await Promise.all([
    db.query.recipeIngredients.findMany({
      where: eq(recipeIngredients.recipeId, recipeId)
    }),
    db.query.recipeInventoryAllocations.findMany({
      where: and(
        eq(recipeInventoryAllocations.userId, userId),
        eq(recipeInventoryAllocations.recipeId, recipeId),
        inArray(recipeInventoryAllocations.status, [...visibleAllocationStatuses])
      )
    })
  ]);
  const inventoryIds = [...new Set(allocations.map((allocation) => allocation.inventoryItemId))];
  const inventoryRows = inventoryIds.length
    ? await db.query.userIngredients.findMany({
      where: and(
        eq(userIngredients.userId, userId),
        inArray(userIngredients.id, inventoryIds)
      )
    })
    : [];
  const inventoryById = new Map(inventoryRows.map((item) => [item.id, item]));
  const allocationsByLineId = new Map<string, typeof allocations[number]>();

  for (const allocation of allocations) {
    const current = allocationsByLineId.get(allocation.recipeIngredientId);
    if (
      !current
      || allocationStatusRank(allocation.status) > allocationStatusRank(current.status)
      || allocation.updatedAt.getTime() > current.updatedAt.getTime()
    ) {
      allocationsByLineId.set(allocation.recipeIngredientId, allocation);
    }
  }

  const coverageLines = [...lines]
    .sort((left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0))
    .map((line): RecipeStockCoverageLineDto => {
      const allocation = allocationsByLineId.get(line.id) ?? null;
      const inventoryItem = allocation ? inventoryById.get(allocation.inventoryItemId) ?? null : null;
      const requiredUnit = parseUnitOrThrow(line.amountNormalizedUnit);
      const allocatedQuantityNormalized = allocation?.allocatedQuantityNormalized ?? 0;
      const availableQuantityNormalized = inventoryItem?.normalizedQuantity ?? null;
      const inventoryDisplayName = inventoryItem?.ingredientDisplayNameSnapshot ?? null;

      return {
        recipeIngredientId: line.id,
        recipeIngredientPersistentKey: line.persistentKey,
        displayOrder: line.displayOrder ?? 0,
        ingredientDisplayName: line.ingredientDisplayNameSnapshot ?? null,
        requiredQuantityNormalized: line.amountNormalizedQuantity,
        requiredNormalizedUnit: requiredUnit,
        allocatedQuantityNormalized,
        availableQuantityNormalized,
        normalizedUnit: allocation
          ? parseUnitOrThrow(allocation.allocatedNormalizedUnit)
          : requiredUnit,
        status: resolveCoverageStatus({
          allocationStatus: allocation?.status ?? null,
          allocatedQuantityNormalized,
          requiredQuantityNormalized: line.amountNormalizedQuantity,
          availableQuantityNormalized
        }),
        inventoryItemId: allocation?.inventoryItemId ?? null,
        inventoryDisplayName,
        allocationId: allocation?.id ?? null
      };
    });

  return {
    recipeId,
    lines: coverageLines,
    summary: buildCoverageSummary(coverageLines)
  };
};

export const allocateRecipeIngredientFromInventory = async (input: {
  userId: string;
  recipeId: string;
  recipeIngredientPersistentKey: string;
  inventoryItemId: string;
}) => {
  await ensureOwnedRecipe(input.userId, input.recipeId);
  const [line, inventoryItem] = await Promise.all([
    db.query.recipeIngredients.findFirst({
      where: and(
        eq(recipeIngredients.recipeId, input.recipeId),
        eq(recipeIngredients.persistentKey, input.recipeIngredientPersistentKey)
      )
    }),
    ensureOwnedInventoryItem(input.userId, input.inventoryItemId)
  ]);

  if (!line) {
    throw new Error("NOT_FOUND");
  }

  assertInventorySourceMatchesRecipeLine(line, inventoryItem);

  await db.transaction(async (tx) => {
    const now = new Date();

    await tx.update(recipeInventoryAllocations).set({
      status: "released",
      releasedAt: now,
      updatedAt: now
    }).where(and(
      eq(recipeInventoryAllocations.userId, input.userId),
      eq(recipeInventoryAllocations.recipeId, input.recipeId),
      eq(recipeInventoryAllocations.recipeIngredientId, line.id),
      inArray(recipeInventoryAllocations.status, [...activeAllocationStatuses])
    ));

    await tx.insert(recipeInventoryAllocations).values({
      userId: input.userId,
      recipeId: input.recipeId,
      recipeIngredientId: line.id,
      recipeIngredientPersistentKey: line.persistentKey,
      inventoryItemId: inventoryItem.id,
      status: "allocated",
      allocatedQuantityNormalized: line.amountNormalizedQuantity,
      allocatedNormalizedUnit: line.amountNormalizedUnit,
      allocationMeta: {
        source: "recipe_selection",
        ingredientDisplayName: line.ingredientDisplayNameSnapshot ?? null
      }
    });
  });
};

export const syncRecipeSelectedInventoryAllocations = async (
  userId: string,
  recipeId: string
): Promise<RecipeStockCoverageDto> => {
  await ensureOwnedRecipe(userId, recipeId);
  const lines = await db.query.recipeIngredients.findMany({
    where: eq(recipeIngredients.recipeId, recipeId)
  });

  for (const line of lines) {
    if (line.inventoryIntentMode !== "use_stock") {
      continue;
    }

    const inventoryItemId = readInventoryItemIdFromMeta(line.inventorySelectionMeta);
    if (!inventoryItemId) {
      continue;
    }

    await allocateRecipeIngredientFromInventory({
      userId,
      recipeId,
      recipeIngredientPersistentKey: line.persistentKey,
      inventoryItemId
    });
  }

  return listRecipeStockCoverage(userId, recipeId);
};

export const reserveRecipeInventoryAllocations = async (
  userId: string,
  recipeId: string
): Promise<RecipeStockCoverageDto> => {
  await ensureOwnedRecipe(userId, recipeId);
  const now = new Date();
  await db.update(recipeInventoryAllocations).set({
    status: "reserved",
    reservedAt: now,
    updatedAt: now
  }).where(and(
    eq(recipeInventoryAllocations.userId, userId),
    eq(recipeInventoryAllocations.recipeId, recipeId),
    eq(recipeInventoryAllocations.status, "allocated")
  ));

  return listRecipeStockCoverage(userId, recipeId);
};

export const releaseRecipeInventoryAllocations = async (
  userId: string,
  recipeId: string
): Promise<RecipeStockCoverageDto> => {
  await ensureOwnedRecipe(userId, recipeId);
  const now = new Date();
  await db.update(recipeInventoryAllocations).set({
    status: "released",
    releasedAt: now,
    updatedAt: now
  }).where(and(
    eq(recipeInventoryAllocations.userId, userId),
    eq(recipeInventoryAllocations.recipeId, recipeId),
    inArray(recipeInventoryAllocations.status, [...activeAllocationStatuses])
  ));

  return listRecipeStockCoverage(userId, recipeId);
};

const convertNormalizedQuantityToEnteredUnit = (
  normalizedQuantity: number,
  normalizedUnit: string,
  enteredUnit: string
) => {
  if (normalizedUnit === enteredUnit) {
    return normalizedQuantity;
  }

  if (normalizedUnit === "g" && ["g", "kg", "oz", "lb"].includes(enteredUnit)) {
    return convertWeight({ value: normalizedQuantity, unit: "g" }, enteredUnit as "g" | "kg" | "oz" | "lb").value;
  }

  if (normalizedUnit === "ml" && ["ml", "l", "gal"].includes(enteredUnit)) {
    return convertVolume({ value: normalizedQuantity, unit: "ml" }, enteredUnit as "ml" | "l" | "gal").value;
  }

  return null;
};

export const consumeRecipeInventoryAllocations = async (
  userId: string,
  recipeId: string,
  options: { brewBatchId?: string | null } = {}
): Promise<RecipeStockCoverageDto> => {
  await ensureOwnedRecipe(userId, recipeId);
  const allocations = await db.query.recipeInventoryAllocations.findMany({
    where: and(
      eq(recipeInventoryAllocations.userId, userId),
      eq(recipeInventoryAllocations.recipeId, recipeId),
      inArray(recipeInventoryAllocations.status, [...activeAllocationStatuses])
    )
  });

  await db.transaction(async (tx) => {
    const now = new Date();

    for (const allocation of allocations) {
      const inventoryItem = await tx.query.userIngredients.findFirst({
        where: and(
          eq(userIngredients.id, allocation.inventoryItemId),
          eq(userIngredients.userId, userId)
        )
      });

      if (!inventoryItem) {
        throw new Error("NOT_FOUND");
      }

      if (inventoryItem.normalizedUnit !== allocation.allocatedNormalizedUnit) {
        throw new Error("INCOMPATIBLE_UNIT");
      }

      if (inventoryItem.normalizedQuantity + 0.000001 < allocation.allocatedQuantityNormalized) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      const quantityBefore = inventoryItem.normalizedQuantity;
      const quantityAfter = roundTo(quantityBefore - allocation.allocatedQuantityNormalized, 3);
      const enteredQuantity = convertNormalizedQuantityToEnteredUnit(
        quantityAfter,
        inventoryItem.normalizedUnit,
        inventoryItem.enteredUnit
      );

      await tx.update(userIngredients).set({
        normalizedQuantity: quantityAfter,
        enteredQuantity: enteredQuantity == null ? inventoryItem.enteredQuantity : roundTo(enteredQuantity, 3),
        updatedAt: now
      }).where(eq(userIngredients.id, inventoryItem.id));

      await tx.insert(inventoryTransactions).values({
        userId,
        inventoryItemId: inventoryItem.id,
        recipeId,
        recipeIngredientId: allocation.recipeIngredientId,
        brewBatchId: options.brewBatchId ?? null,
        type: "consume",
        quantityDeltaNormalized: -allocation.allocatedQuantityNormalized,
        normalizedUnit: allocation.allocatedNormalizedUnit,
        quantityBeforeNormalized: quantityBefore,
        quantityAfterNormalized: quantityAfter,
        transactionMeta: {
          allocationId: allocation.id,
          recipeIngredientPersistentKey: allocation.recipeIngredientPersistentKey
        }
      });

      await tx.update(recipeInventoryAllocations).set({
        status: "consumed",
        consumedAt: now,
        updatedAt: now
      }).where(eq(recipeInventoryAllocations.id, allocation.id));
    }
  });

  return listRecipeStockCoverage(userId, recipeId);
};
