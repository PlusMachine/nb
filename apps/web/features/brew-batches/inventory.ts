import {
  and,
  asc,
  db,
  eq,
  inArray,
  inventoryTransactions,
  recipeInventoryAllocations,
  userIngredients
} from "@nb/db";
import { roundTo } from "@nb/brewing-core";

import {
  autoAllocateRecipeInventoryFromStock,
  consumeRecipeInventoryAllocations,
  convertNormalizedQuantityToEnteredUnit,
  hasBlockingConsumedAllocations
} from "../recipes/inventory-service";
import { getBrewBatchById } from "./service";
import type {
  BrewBatchInventoryConsumedLine,
  BrewBatchInventoryLogEntry,
  BrewBatchInventoryView
} from "./contracts";

// Списание склада на варку: партия — точка, где списание ингредиентов становится
// частью жизненного цикла. Переиспользуем движок аллокаций/транзакций
// (recipes/inventory-service), привязывая транзакции и сами аллокации к
// brew_batch_id и давая откат (release) при отмене.
//
// Источник истины «потреблён ли рецепт» — статус аллокаций (consumed), но защита
// от повторного списания batch-aware (см. hasBlockingConsumedAllocations в
// recipes/inventory-service.ts): consumed-аллокация блокирует новую варку только
// пока её партия ещё активна (planned/brewing/fermenting) или у неё вовсе нет
// brewBatchId (списание из редактора рецепта/легаси). Когда партия доведена до
// completed/cancelled, её consumed-аллокации остаются consumed (запас реально
// потрачен), но новую варку того же рецепта уже не блокируют — иначе рецепт был
// бы годен для варки ровно один раз навсегда (см. docs/brew-day-assistant-audit-
// round2.md, П2).

const CONSUME_EPSILON = 0.000001;

const transactionTypes = ["consume", "reserve", "release", "adjustment"] as const;
const asTransactionType = (value: string): BrewBatchInventoryLogEntry["type"] =>
  (transactionTypes as readonly string[]).includes(value)
    ? (value as BrewBatchInventoryLogEntry["type"])
    : "adjustment";

type NetEntry = { delta: number; unit: string };

// Нетто-движение склада этой партии по позициям (consume отрицателен, release
// положителен). delta < 0 → позиция списана и ещё не возвращена.
const netByInventoryItem = (
  transactions: Array<typeof inventoryTransactions.$inferSelect>
): Map<string, NetEntry> => {
  const net = new Map<string, NetEntry>();
  for (const txn of transactions) {
    const current = net.get(txn.inventoryItemId) ?? { delta: 0, unit: txn.normalizedUnit };
    current.delta = roundTo(current.delta + txn.quantityDeltaNormalized, 6);
    net.set(txn.inventoryItemId, current);
  }
  return net;
};

const loadBatchTransactions = async (userId: string, brewBatchId: string) =>
  db
    .select()
    .from(inventoryTransactions)
    .where(and(
      eq(inventoryTransactions.userId, userId),
      eq(inventoryTransactions.brewBatchId, brewBatchId)
    ))
    .orderBy(asc(inventoryTransactions.createdAt));

// Подтягивает человекочитаемые имена позиций по id (имя нет в транзакции).
const loadInventoryNames = async (userId: string, itemIds: string[]) => {
  if (itemIds.length === 0) {
    return new Map<string, string | null>();
  }
  const rows = await db.query.userIngredients.findMany({
    where: and(eq(userIngredients.userId, userId), inArray(userIngredients.id, itemIds)),
    columns: { id: true, ingredientDisplayNameSnapshot: true }
  });
  return new Map(rows.map((row) => [row.id, row.ingredientDisplayNameSnapshot ?? null]));
};

const buildView = async (
  userId: string,
  brewBatchId: string,
  recipeId: string | null
): Promise<BrewBatchInventoryView> => {
  const [transactions, recipeConsumed] = await Promise.all([
    loadBatchTransactions(userId, brewBatchId),
    // Batch-aware защита от двойного списания (см. заголовок файла) неприменима,
    // если источник удалён (recipeId=NULL) — журнал этой партии тогда самодостаточен.
    recipeId ? hasBlockingConsumedAllocations(userId, recipeId) : Promise.resolve(false)
  ]);
  const net = netByInventoryItem(transactions);
  const itemIds = [...new Set(transactions.map((txn) => txn.inventoryItemId))];
  const names = await loadInventoryNames(userId, itemIds);

  const consumed: BrewBatchInventoryConsumedLine[] = [];
  for (const [inventoryItemId, entry] of net) {
    if (entry.delta < -CONSUME_EPSILON) {
      consumed.push({
        inventoryItemId,
        ingredientDisplayName: names.get(inventoryItemId) ?? null,
        quantityNormalized: roundTo(-entry.delta, 3),
        normalizedUnit: entry.unit
      });
    }
  }
  consumed.sort((left, right) => (left.ingredientDisplayName ?? "").localeCompare(right.ingredientDisplayName ?? "", "ru"));

  const log: BrewBatchInventoryLogEntry[] = transactions.map((txn) => ({
    id: txn.id,
    inventoryItemId: txn.inventoryItemId,
    ingredientDisplayName: names.get(txn.inventoryItemId) ?? null,
    type: asTransactionType(txn.type),
    quantityDeltaNormalized: txn.quantityDeltaNormalized,
    normalizedUnit: txn.normalizedUnit,
    createdAt: txn.createdAt
  }));

  return {
    brewBatchId,
    recipeId,
    hasConsumed: consumed.length > 0,
    canRestore: consumed.length > 0,
    recipeAlreadyConsumed: recipeConsumed,
    consumed,
    log
  };
};

/** Складское состояние партии (ownership-checked): что списано + журнал движений. */
export const getBrewBatchInventoryView = async (
  userId: string,
  brewBatchId: string
): Promise<BrewBatchInventoryView | null> => {
  const batch = await getBrewBatchById(userId, brewBatchId);
  if (!batch) {
    return null;
  }
  return buildView(userId, brewBatchId, batch.recipeId);
};

/**
 * Списать ингредиенты рецепта со склада на эту партию: авто-подбор склада под
 * строки + consume активных аллокаций с привязкой к brewBatchId. Защита:
 * - терминальный статус (cancelled/completed) → INVALID_STATUS;
 * - рецепт уже списан активной партией или вне партии (где-либо) → ALREADY_CONSUMED
 *   (batch-aware защита от двойного списания, см. заголовок файла: партии в
 *   completed/cancelled уже не блокируют, только planned/brewing/fermenting).
 */
export const consumeBrewBatchInventory = async (
  userId: string,
  brewBatchId: string
): Promise<BrewBatchInventoryView> => {
  const batch = await getBrewBatchById(userId, brewBatchId);
  if (!batch) {
    throw new Error("NOT_FOUND");
  }
  if (batch.status === "cancelled" || batch.status === "completed") {
    throw new Error("INVALID_STATUS");
  }
  // Списание тянет состав из рецепта-источника. Если его больше нет (варка без
  // клона, источник удалён/скрыт) — авто-списание невозможно; варочный день/
  // журнал при этом продолжают работать от снапшота.
  if (!batch.recipeId) {
    throw new Error("RECIPE_UNAVAILABLE");
  }
  if (await hasBlockingConsumedAllocations(userId, batch.recipeId)) {
    throw new Error("ALREADY_CONSUMED");
  }

  await autoAllocateRecipeInventoryFromStock(userId, batch.recipeId);
  await consumeRecipeInventoryAllocations(userId, batch.recipeId, { brewBatchId });

  return buildView(userId, brewBatchId, batch.recipeId);
};

/**
 * Вернуть списанное этой партией на склад (откат при отмене/по кнопке). Реверс
 * нетто-списания: каждой позиции добавляем недостающее, пишем компенсирующую
 * release-транзакцию, и возвращаем потреблённые этой партией аллокации в
 * released (чтобы покрытие рецепта согласовалось и повторное списание было
 * возможно). Идемпотентно (после возврата нетто = 0). Возвращает число
 * фактически возвращённых позиций — для честного сообщения.
 */
export const restoreBrewBatchInventory = async (
  userId: string,
  brewBatchId: string
): Promise<{ view: BrewBatchInventoryView; restoredItemCount: number }> => {
  const batch = await getBrewBatchById(userId, brewBatchId);
  if (!batch) {
    throw new Error("NOT_FOUND");
  }

  const transactions = await loadBatchTransactions(userId, brewBatchId);
  const net = netByInventoryItem(transactions);
  // Аллокации, потреблённые ЭТОЙ партией — два источника, объединяем множества:
  // 1) прямой путь — recipe_inventory_allocations.brew_batch_id = эта партия
  //    (проставляется в consumeRecipeInventoryAllocations начиная с миграции 0047);
  // 2) легаси-путь — мета consume-транзакций (allocationId), нужен для аллокаций,
  //    списанных до появления brew_batch_id на самой аллокации (см. backfill в
  //    0047_complete_dust.sql — покрывает основную часть истории, но подстрахуемся).
  const legacyConsumedAllocationIds = transactions
    .filter((txn) => txn.type === "consume")
    .map((txn) => {
      const meta = txn.transactionMeta as { allocationId?: unknown } | null;
      return meta && typeof meta.allocationId === "string" ? meta.allocationId : null;
    })
    .filter((value): value is string => Boolean(value));
  const directConsumedAllocations = await db.query.recipeInventoryAllocations.findMany({
    where: and(
      eq(recipeInventoryAllocations.userId, userId),
      eq(recipeInventoryAllocations.brewBatchId, brewBatchId),
      eq(recipeInventoryAllocations.status, "consumed")
    ),
    columns: { id: true }
  });
  const consumedAllocationIds = [...new Set([
    ...legacyConsumedAllocationIds,
    ...directConsumedAllocations.map((allocation) => allocation.id)
  ])];

  let restoredItemCount = 0;

  await db.transaction(async (tx) => {
    const now = new Date();
    for (const [inventoryItemId, entry] of net) {
      if (entry.delta >= -CONSUME_EPSILON) {
        continue;
      }
      const restoreAmount = roundTo(-entry.delta, 3);
      const item = await tx.query.userIngredients.findFirst({
        where: and(eq(userIngredients.id, inventoryItemId), eq(userIngredients.userId, userId))
      });
      if (!item) {
        continue;
      }

      // Складская позиция сменила единицу с момента списания: вернуть в исходных
      // единицах нельзя. Пишем нейтрализующую adjustment-транзакцию (нетто → 0),
      // чтобы UI не предлагал бесконечно «вернуть» то, что вернуть нечем.
      if (item.normalizedUnit !== entry.unit) {
        await tx.insert(inventoryTransactions).values({
          userId,
          inventoryItemId,
          recipeId: batch.recipeId,
          brewBatchId,
          type: "adjustment",
          quantityDeltaNormalized: restoreAmount,
          normalizedUnit: entry.unit,
          quantityBeforeNormalized: item.normalizedQuantity,
          quantityAfterNormalized: item.normalizedQuantity,
          transactionMeta: { reason: "brew_batch_restore_unit_changed" }
        });
        continue;
      }

      const quantityBefore = item.normalizedQuantity;
      const quantityAfter = roundTo(quantityBefore + restoreAmount, 3);
      const enteredQuantity = convertNormalizedQuantityToEnteredUnit(
        quantityAfter,
        item.normalizedUnit,
        item.enteredUnit
      );

      await tx.update(userIngredients).set({
        normalizedQuantity: quantityAfter,
        enteredQuantity: enteredQuantity == null ? item.enteredQuantity : roundTo(enteredQuantity, 3),
        updatedAt: now
      }).where(eq(userIngredients.id, item.id));

      await tx.insert(inventoryTransactions).values({
        userId,
        inventoryItemId,
        recipeId: batch.recipeId,
        brewBatchId,
        type: "release",
        quantityDeltaNormalized: restoreAmount,
        normalizedUnit: entry.unit,
        quantityBeforeNormalized: quantityBefore,
        quantityAfterNormalized: quantityAfter,
        transactionMeta: { reason: "brew_batch_restore" }
      });
      restoredItemCount += 1;
    }

    // Возвращаем потреблённые ЭТОЙ партией аллокации в released: согласует
    // покрытие рецепта и позволяет повторно списать после возврата.
    if (consumedAllocationIds.length) {
      await tx.update(recipeInventoryAllocations).set({
        status: "released",
        releasedAt: now,
        updatedAt: now
      }).where(and(
        eq(recipeInventoryAllocations.userId, userId),
        inArray(recipeInventoryAllocations.id, consumedAllocationIds),
        eq(recipeInventoryAllocations.status, "consumed")
      ));
    }
  });

  const view = await buildView(userId, brewBatchId, batch.recipeId);
  return { view, restoredItemCount };
};
