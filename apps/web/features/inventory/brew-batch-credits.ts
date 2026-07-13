import { and, db, eq, inArray, recipeInventoryAllocations } from "@nb/db";
import { roundTo } from "@nb/brewing-core";

/**
 * Кредит склада под партию: сколько уже СПИСАНО со складской позиции ради этой
 * самой варки.
 *
 * Зачем: списание физически уменьшает остаток, а матч рецепта считает нехватку
 * по текущему остатку — и партия, под которую 4 кг солода уже ушли в затор,
 * начинает сама себе показывать «не хватает 3 кг» и требовать докупки. Кредит
 * виртуально возвращает списанное на склад, но ТОЛЬКО в контексте этой партии:
 * матч воспроизводит состояние склада ДО клика «Списать».
 *
 * Единица кредита — единица складской позиции (`inventoryItem.normalizedUnit`):
 * consume пишет аллокацию уже в ней и падает `INCOMPATIBLE_UNIT`, если единицы
 * разошлись (см. `recipes/inventory-service.ts`). Потребитель всё равно обязан
 * сверить единицу перед сложением — позицию могли пересоздать/переоформить
 * после списания.
 *
 * Возврат на склад (`restoreBrewBatchInventory`) переводит аллокации в
 * `released` → кредит исчезает сам, нехватка честно возвращается.
 */
export type InventoryCreditEntry = {
  quantityNormalized: number;
  normalizedUnit: string;
};

/** inventoryItemId → сколько списано под партию. */
export type InventoryCreditMap = Map<string, InventoryCreditEntry>;

const addCredit = (credits: InventoryCreditMap, row: {
  brewBatchId: string;
  inventoryItemId: string;
  allocatedQuantityNormalized: number;
  allocatedNormalizedUnit: string;
}): void => {
  const existing = credits.get(row.inventoryItemId);
  if (!existing) {
    credits.set(row.inventoryItemId, {
      quantityNormalized: roundTo(row.allocatedQuantityNormalized, 3),
      normalizedUnit: row.allocatedNormalizedUnit
    });
    return;
  }

  // Одна позиция склада, но аллокации в разных единицах — при текущем consume
  // невозможно (он сам бросает INCOMPATIBLE_UNIT). Если это всё же случилось,
  // складывать разнородные числа нельзя: берём первую единицу и шумим в лог,
  // чтобы кривые данные не превратились в тихо завышенный кредит.
  if (existing.normalizedUnit !== row.allocatedNormalizedUnit) {
    console.error("[inventory] brew batch credit: mixed allocation units on one inventory item", {
      brewBatchId: row.brewBatchId,
      inventoryItemId: row.inventoryItemId,
      keptUnit: existing.normalizedUnit,
      skippedUnit: row.allocatedNormalizedUnit
    });
    return;
  }

  existing.quantityNormalized = roundTo(
    existing.quantityNormalized + row.allocatedQuantityNormalized,
    3
  );
};

/** Кредиты сразу по набору партий — один запрос (для /app/shopping). */
export const getBrewBatchInventoryCreditsForBatches = async (
  userId: string,
  brewBatchIds: string[]
): Promise<Map<string, InventoryCreditMap>> => {
  const ids = [...new Set(brewBatchIds)].filter(Boolean);
  if (ids.length === 0) {
    return new Map();
  }

  const rows = await db.query.recipeInventoryAllocations.findMany({
    where: and(
      eq(recipeInventoryAllocations.userId, userId),
      inArray(recipeInventoryAllocations.brewBatchId, ids),
      eq(recipeInventoryAllocations.status, "consumed")
    ),
    columns: {
      brewBatchId: true,
      inventoryItemId: true,
      allocatedQuantityNormalized: true,
      allocatedNormalizedUnit: true
    }
  });

  const byBatch = new Map<string, InventoryCreditMap>();
  for (const row of rows) {
    // brewBatchId в схеме nullable (списание вне партии / легаси), но фильтр
    // inArray его уже отсёк — проверка только ради типа.
    if (!row.brewBatchId) {
      continue;
    }
    const credits = byBatch.get(row.brewBatchId) ?? new Map<string, InventoryCreditEntry>();
    byBatch.set(row.brewBatchId, credits);
    addCredit(credits, {
      brewBatchId: row.brewBatchId,
      inventoryItemId: row.inventoryItemId,
      allocatedQuantityNormalized: row.allocatedQuantityNormalized,
      allocatedNormalizedUnit: row.allocatedNormalizedUnit
    });
  }

  return byBatch;
};

/** Кредиты одной партии. */
export const getBrewBatchInventoryCredits = async (
  userId: string,
  brewBatchId: string
): Promise<InventoryCreditMap> => {
  const byBatch = await getBrewBatchInventoryCreditsForBatches(userId, [brewBatchId]);
  return byBatch.get(brewBatchId) ?? new Map<string, InventoryCreditEntry>();
};
