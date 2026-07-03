import {
  and,
  brewBatches,
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

// Статусы партии, которые считаются «в работе» — их consumed-аллокации продолжают
// запирать рецепт от повторного списания/переаллокации. Дублируем локально
// activeBrewBatchStatuses из features/brew-batches/contracts.ts вместо импорта:
// features/brew-batches уже импортирует движок аллокаций отсюда (см. inventory.ts
// там), обратный импорт создал бы циклическую зависимость между фичами. Источник
// истины для списка статусов — features/brew-batches/contracts.ts.
const activeConsumingBrewBatchStatuses = ["planned", "brewing", "fermenting"] as const;

/**
 * Из списка consumed-аллокаций возвращает только те, что ДЕЙСТВИТЕЛЬНО запирают
 * рецепт от повторного списания/переаллокации (см. docs/brew-day-assistant-audit-
 * round2.md, П2): без привязки к партии (brewBatchId=NULL — списание из редактора
 * рецепта или легаси-запись до миграции 0047) — блокирует консервативно; с
 * привязкой — блокирует, только если партия ещё в активном статусе
 * (planned/brewing/fermenting). Партии в completed/cancelled запасы реально
 * потратили, но реюз рецепта для новой варки больше не блокируют.
 */
const filterBlockingConsumedAllocations = async <T extends { brewBatchId: string | null }>(
  allocations: T[]
): Promise<T[]> => {
  const batchIds = [...new Set(
    allocations.map((allocation) => allocation.brewBatchId).filter((id): id is string => Boolean(id))
  )];

  if (batchIds.length === 0) {
    return allocations.filter((allocation) => !allocation.brewBatchId);
  }

  const batches = await db.query.brewBatches.findMany({
    where: inArray(brewBatches.id, batchIds),
    columns: { id: true, status: true }
  });
  const activeBatchIds = new Set(
    batches
      .filter((batch) => (activeConsumingBrewBatchStatuses as readonly string[]).includes(batch.status))
      .map((batch) => batch.id)
  );

  return allocations.filter((allocation) => !allocation.brewBatchId || activeBatchIds.has(allocation.brewBatchId));
};

/**
 * Есть ли у рецепта consumed-аллокации, которые реально блокируют повторное
 * списание (см. filterBlockingConsumedAllocations). Используется и из редактора
 * рецепта, и из features/brew-batches (consumeBrewBatchInventory) — единая
 * batch-aware замена прежней «рецепт списан навсегда» проверки.
 */
export const hasBlockingConsumedAllocations = async (userId: string, recipeId: string): Promise<boolean> => {
  const consumed = await db.query.recipeInventoryAllocations.findMany({
    where: and(
      eq(recipeInventoryAllocations.userId, userId),
      eq(recipeInventoryAllocations.recipeId, recipeId),
      eq(recipeInventoryAllocations.status, "consumed")
    ),
    columns: { id: true, brewBatchId: true }
  });

  if (consumed.length === 0) {
    return false;
  }

  const blocking = await filterBlockingConsumedAllocations(consumed);
  return blocking.length > 0;
};

const ensureOwnedRecipe = async (userId: string, recipeId: string) => {
  const recipe = await db.query.recipes.findFirst({
    where: and(eq(recipes.id, recipeId), eq(recipes.authorId, userId))
  });

  if (!recipe) {
    throw new Error("NOT_FOUND");
  }

  return recipe;
};

// Рецепт, из которого МОЖНО списывать склад на варку: свой (любой статус) ИЛИ
// чужой published — чтобы варить без клонирования. Ownership не требует, но
// вызывающий обязан НЕ мутировать поля чужого рецепта (см. autoAllocate: selection-
// meta пишем только своему). Возвращает authorId для проверки «свой ли рецепт».
const ensureBrewableRecipe = async (userId: string, recipeId: string) => {
  const recipe = await db.query.recipes.findFirst({
    where: eq(recipes.id, recipeId),
    columns: { id: true, authorId: true, publicationState: true }
  });

  if (!recipe) {
    throw new Error("NOT_FOUND");
  }

  if (recipe.authorId !== userId && recipe.publicationState !== "published") {
    throw new Error("FORBIDDEN");
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

const inventorySourceMatchesRecipeLine = (
  line: typeof recipeIngredients.$inferSelect,
  inventoryItem: typeof userIngredients.$inferSelect
) => {
  const catalogMatches = line.ingredientCatalogItemId
    && inventoryItem.ingredientCatalogItemId
    && line.ingredientCatalogItemId === inventoryItem.ingredientCatalogItemId;
  const customMatches = line.userCustomIngredientId
    && inventoryItem.userCustomIngredientId
    && line.userCustomIngredientId === inventoryItem.userCustomIngredientId;

  return Boolean(catalogMatches || customMatches);
};

const inventoryItemCanCoverRecipeLine = (
  line: typeof recipeIngredients.$inferSelect,
  inventoryItem: typeof userIngredients.$inferSelect
) => (
  inventorySourceMatchesRecipeLine(line, inventoryItem)
  && line.amountNormalizedUnit === inventoryItem.normalizedUnit
);

const findOwnedInventoryItemByRecipeLineSource = async (
  userId: string,
  line: typeof recipeIngredients.$inferSelect
) => {
  const sourceFilter = line.ingredientCatalogItemId
    ? eq(userIngredients.ingredientCatalogItemId, line.ingredientCatalogItemId)
    : line.userCustomIngredientId
      ? eq(userIngredients.userCustomIngredientId, line.userCustomIngredientId)
      : null;

  if (!sourceFilter) {
    return null;
  }

  const candidates = await db.query.userIngredients.findMany({
    where: and(
      eq(userIngredients.userId, userId),
      sourceFilter
    )
  });

  return candidates
    .filter((item) => !item.archivedAt && inventoryItemCanCoverRecipeLine(line, item))
    .sort((left, right) => (
      right.normalizedQuantity - left.normalizedQuantity
      || right.updatedAt.getTime() - left.updatedAt.getTime()
    ))[0] ?? null;
};

const resolveOwnedInventoryItemForRecipeLine = async (
  userId: string,
  line: typeof recipeIngredients.$inferSelect,
  inventoryItemId: string | null
) => {
  if (inventoryItemId) {
    const selected = await db.query.userIngredients.findFirst({
      where: and(eq(userIngredients.id, inventoryItemId), eq(userIngredients.userId, userId))
    });

    if (selected && inventoryItemCanCoverRecipeLine(line, selected)) {
      return selected;
    }
  }

  return findOwnedInventoryItemByRecipeLineSource(userId, line);
};

const updateRecipeLineInventorySelectionMeta = async (
  line: typeof recipeIngredients.$inferSelect,
  inventoryItem: typeof userIngredients.$inferSelect
) => {
  const currentMeta = line.inventorySelectionMeta && typeof line.inventorySelectionMeta === "object" && !Array.isArray(line.inventorySelectionMeta)
    ? line.inventorySelectionMeta
    : {};

  if ((currentMeta as { inventoryItemId?: unknown }).inventoryItemId === inventoryItem.id) {
    return;
  }

  await db.update(recipeIngredients).set({
    inventorySelectionMeta: {
      ...currentMeta,
      inventoryItemId: inventoryItem.id,
      stockNormalizedQuantity: inventoryItem.normalizedQuantity,
      stockNormalizedUnit: inventoryItem.normalizedUnit
    },
    updatedAt: new Date()
  }).where(eq(recipeIngredients.id, line.id));
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
  const [lines, rawAllocations] = await Promise.all([
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
  // Consumed-аллокации завершённых/отменённых партий больше не отражают текущее
  // покрытие рецепта (запас реально потрачен, но реюз рецепта для новой варки уже
  // не заблокирован) — выкидываем их из проекции, чтобы строка не «зависала» в
  // статусе consumed после того, как варка закрыта.
  const nonConsumed = rawAllocations.filter((allocation) => allocation.status !== "consumed");
  const consumedOnly = rawAllocations.filter((allocation) => allocation.status === "consumed");
  const blockingConsumed = await filterBlockingConsumedAllocations(consumedOnly);
  const allocations = [...nonConsumed, ...blockingConsumed];
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
  await ensureBrewableRecipe(input.userId, input.recipeId);
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
    const inventoryItem = await resolveOwnedInventoryItemForRecipeLine(userId, line, inventoryItemId);
    if (!inventoryItem) {
      continue;
    }

    await updateRecipeLineInventorySelectionMeta(line, inventoryItem);
    await allocateRecipeIngredientFromInventory({
      userId,
      recipeId,
      recipeIngredientPersistentKey: line.persistentKey,
      inventoryItemId: inventoryItem.id
    });
  }

  return listRecipeStockCoverage(userId, recipeId);
};

/**
 * Авто-подбор склада под ВСЕ строки рецепта по совпадению источника (каталог/
 * кастом + единица), независимо от inventoryIntentMode. В отличие от
 * syncRecipeSelectedInventoryAllocations (только строки use_stock), нужен для
 * «списать на варку», когда автор не выбирал позиции в редакторе вручную.
 * Идемпотентно: строки с активной аллокацией пропускаются; без подходящей
 * позиции на складе — тоже. Возвращает обновлённое покрытие.
 */
export const autoAllocateRecipeInventoryFromStock = async (
  userId: string,
  recipeId: string
): Promise<RecipeStockCoverageDto> => {
  const recipe = await ensureBrewableRecipe(userId, recipeId);
  const isOwnRecipe = recipe.authorId === userId;
  const [lines, candidateAllocations] = await Promise.all([
    db.query.recipeIngredients.findMany({
      where: eq(recipeIngredients.recipeId, recipeId)
    }),
    // Пропускаем строки с активной ИЛИ уже потреблённой аллокацией: consumed-строки
    // нельзя переаллоцировать и списать повторно (иначе двойное списание склада).
    // Consumed-строки завершённых/отменённых партий — исключение (см. ниже).
    db.query.recipeInventoryAllocations.findMany({
      where: and(
        eq(recipeInventoryAllocations.userId, userId),
        eq(recipeInventoryAllocations.recipeId, recipeId),
        inArray(recipeInventoryAllocations.status, ["allocated", "reserved", "consumed"])
      )
    })
  ]);
  const nonConsumedAllocations = candidateAllocations.filter((allocation) => allocation.status !== "consumed");
  const consumedAllocations = candidateAllocations.filter((allocation) => allocation.status === "consumed");
  const blockingConsumedAllocations = await filterBlockingConsumedAllocations(consumedAllocations);
  const blockingAllocations = [...nonConsumedAllocations, ...blockingConsumedAllocations];
  const allocatedLineIds = new Set(blockingAllocations.map((allocation) => allocation.recipeIngredientId));

  for (const line of lines) {
    if (allocatedLineIds.has(line.id)) {
      continue;
    }
    const inventoryItem = await findOwnedInventoryItemByRecipeLineSource(userId, line);
    if (!inventoryItem) {
      continue;
    }
    // Selection-meta — UX-подсказка редактора «какая позиция склада закрывает
    // строку». Пишем ТОЛЬКО в свой рецепт: варка чужого не должна мутировать его
    // строки/updatedAt (и порядок в витрине). Аллокация — user-scoped, её пишем всегда.
    if (isOwnRecipe) {
      await updateRecipeLineInventorySelectionMeta(line, inventoryItem);
    }
    await allocateRecipeIngredientFromInventory({
      userId,
      recipeId,
      recipeIngredientPersistentKey: line.persistentKey,
      inventoryItemId: inventoryItem.id
    });
  }

  return listRecipeStockCoverage(userId, recipeId);
};

export const reserveRecipeInventoryAllocations = async (
  userId: string,
  recipeId: string
): Promise<RecipeStockCoverageDto> => {
  await ensureBrewableRecipe(userId, recipeId);
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
  await ensureBrewableRecipe(userId, recipeId);
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

export const convertNormalizedQuantityToEnteredUnit = (
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
  await ensureBrewableRecipe(userId, recipeId);
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
        // Партия-потребитель: без неё завершение/отмена ЛЮБОЙ будущей партии не
        // сможет отличить эту аллокацию от чужой при batch-aware проверке блокировки.
        brewBatchId: options.brewBatchId ?? null,
        consumedAt: now,
        updatedAt: now
      }).where(eq(recipeInventoryAllocations.id, allocation.id));
    }
  });

  return listRecipeStockCoverage(userId, recipeId);
};
