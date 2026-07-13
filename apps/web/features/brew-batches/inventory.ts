import {
  and,
  asc,
  brewBatches,
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
  hasConsumedAllocationsForBatch,
  loadInventoryItemPackEquivalent,
  type InventoryDbClient
} from "../recipes/inventory-service";
import { readBrewPlanBatchVolumeL, readBrewPlanEfficiencyFactor } from "../recipes/batch-scale";
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
// Учёт ведётся ПО ПАРТИИ, а не по рецепту: один рецепт можно варить сколько угодно
// раз, в том числе пока прошлая варка ещё бродит. Каждая партия подбирает и
// списывает свои аллокации из ТЕКУЩЕГО остатка склада (остаток уменьшается
// физически, поэтому второй варке достаётся уже уменьшенный склад — двойного
// списания не возникает). Защита нужна ровно одна: одна и та же партия не списывает
// дважды — её даёт hasConsumedAllocationsForBatch + область подбора в
// recipes/inventory-service.ts. Прежняя защита «по рецепту» молча оставляла вторую
// партию без единой аллокации (дефект A7).

const CONSUME_EPSILON = 0.000001;

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Блокировка строки партии на время транзакции. Ею сериализуются операции склада
 * ОДНОЙ партии: списание (гейт «уже списано?» + подбор + consume) и возврат. Без
 * неё два перекрывающихся запроса (две вкладки, ретрай после таймаута) оба
 * проходили гейт, оба подбирали свои аллокации и списывали склад дважды — а
 * «Вернуть на склад» возвращал вдвое больше, чем взяли.
 *
 * Возвращает статус ПОД блокировкой: снаружи транзакции он уже мог протухнуть.
 */
const lockBrewBatchRow = async (tx: DbTransaction, userId: string, brewBatchId: string) => {
  const [locked] = await tx
    .select({ id: brewBatches.id, status: brewBatches.status })
    .from(brewBatches)
    .where(and(eq(brewBatches.id, brewBatchId), eq(brewBatches.userId, userId)))
    .for("update");

  if (!locked) {
    throw new Error("NOT_FOUND");
  }

  return locked;
};

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

const loadBatchTransactions = async (
  userId: string,
  brewBatchId: string,
  client: InventoryDbClient = db
) =>
  client
    .select()
    .from(inventoryTransactions)
    .where(and(
      eq(inventoryTransactions.userId, userId),
      eq(inventoryTransactions.brewBatchId, brewBatchId)
    ))
    .orderBy(asc(inventoryTransactions.createdAt));

// Аллокации, потреблённые ЭТОЙ партией. Отсюда же — флаг «партия уже списывала»
// (возврат переводит их в released, и списать можно снова).
const loadBatchConsumedAllocations = async (
  userId: string,
  brewBatchId: string,
  client: InventoryDbClient = db
) =>
  client.query.recipeInventoryAllocations.findMany({
    where: and(
      eq(recipeInventoryAllocations.userId, userId),
      eq(recipeInventoryAllocations.brewBatchId, brewBatchId),
      eq(recipeInventoryAllocations.status, "consumed")
    )
  });

type ConsumedAllocationRow = Awaited<ReturnType<typeof loadBatchConsumedAllocations>>[number];

/** Требование рецепта по позиции склада — то, что аллокация просила ДО клампа. */
type ItemRequirement = { requiredNormalized: number; unit: string; clamped: boolean };

// Дрожжей на складе меньше, чем требует рецепт → списание ужимается до остатка
// (см. isPresenceBasedRecipeLine в recipes/inventory-service.ts) и метит аллокацию
// clamped + requestedQuantityNormalized. Собираем это по позициям склада, чтобы
// строка «Склада» на странице партии честно показала «списали меньше, чем нужно»,
// а не бодрое «Списано».
const buildRequirementsByItem = (allocations: ConsumedAllocationRow[]): Map<string, ItemRequirement> => {
  const requirements = new Map<string, ItemRequirement>();

  for (const allocation of allocations) {
    const meta = allocation.allocationMeta && typeof allocation.allocationMeta === "object" && !Array.isArray(allocation.allocationMeta)
      ? allocation.allocationMeta as Record<string, unknown>
      : {};
    const requested = meta.requestedQuantityNormalized;
    const clamped = meta.clamped === true;
    const required = typeof requested === "number" && Number.isFinite(requested) && requested > 0
      ? requested
      : allocation.allocatedQuantityNormalized;

    if (typeof required !== "number" || !Number.isFinite(required)) {
      continue;
    }

    const current = requirements.get(allocation.inventoryItemId);
    if (!current) {
      requirements.set(allocation.inventoryItemId, {
        requiredNormalized: required,
        unit: allocation.allocatedNormalizedUnit,
        clamped
      });
      continue;
    }

    // Разные единицы на одной позиции consume не создаёт (падает INCOMPATIBLE_UNIT).
    // Если это всё же случилось — не складываем разнородное, оставляем как есть.
    if (current.unit !== allocation.allocatedNormalizedUnit) {
      continue;
    }

    current.requiredNormalized = roundTo(current.requiredNormalized + required, 3);
    current.clamped = current.clamped || clamped;
  }

  return requirements;
};

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
  const [transactions, consumedAllocations] = await Promise.all([
    loadBatchTransactions(userId, brewBatchId),
    // Списывала ли ЭТА партия (и не вернула). Списания соседних партий того же
    // рецепта сюда не относятся и кнопку не гасят.
    loadBatchConsumedAllocations(userId, brewBatchId)
  ]);
  const net = netByInventoryItem(transactions);
  const requirements = buildRequirementsByItem(consumedAllocations);
  const itemIds = [...new Set(transactions.map((txn) => txn.inventoryItemId))];
  const names = await loadInventoryNames(userId, itemIds);

  const consumed: BrewBatchInventoryConsumedLine[] = [];
  for (const [inventoryItemId, entry] of net) {
    if (entry.delta < -CONSUME_EPSILON) {
      const quantityNormalized = roundTo(-entry.delta, 3);
      const requirement = requirements.get(inventoryItemId);
      // Показываем требование, только если списали МЕНЬШЕ: иначе это шум.
      const requiredQuantityNormalized = requirement
        && requirement.clamped
        && requirement.unit === entry.unit
        && requirement.requiredNormalized > quantityNormalized + CONSUME_EPSILON
        ? roundTo(requirement.requiredNormalized, 3)
        : null;

      consumed.push({
        inventoryItemId,
        ingredientDisplayName: names.get(inventoryItemId) ?? null,
        quantityNormalized,
        normalizedUnit: entry.unit,
        requiredQuantityNormalized
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
    batchAlreadyConsumed: consumedAllocations.length > 0,
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
 * строки + consume активных аллокаций этой партии. Защита:
 * - терминальный статус (cancelled/completed) → INVALID_STATUS;
 * - ЭТА партия уже списывала и не возвращала → ALREADY_CONSUMED (идемпотентность
 *   повторного нажатия). Списания других партий того же рецепта не мешают: они
 *   уже уменьшили склад, и эта варка берёт из остатка.
 *
 * Гейт, подбор и списание идут ОДНОЙ транзакцией под блокировкой строки партии:
 * порознь два перекрывающихся запроса (две вкладки, ретрай) оба видели «ещё не
 * списано», оба создавали аллокации и оба уменьшали склад.
 *
 * Потребность считается от объёма ЭТОЙ партии (brew_plan_snapshot.recipe.batchSizeL)
 * — тем же множителем, что и матч (features/recipes/batch-scale.ts). Раньше матч
 * масштабировал строки под дефолтный профиль оборудования, а списание брало
 * количества рецепта как есть: «Хватает всего» на странице соседствовало с
 * INSUFFICIENT_STOCK по кнопке.
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
  const recipeId = batch.recipeId;
  if (!recipeId) {
    throw new Error("RECIPE_UNAVAILABLE");
  }

  const targetBatchVolumeL = readBrewPlanBatchVolumeL(batch.brewPlanSnapshot);
  // Дожим засыпи под эффективность оборудования варщика — тот же множитель, что уже
  // зашит в план варочного дня и слепок состава (см. features/recipes/scale.ts).
  // Не передать его сюда = списать засыпь по авторской эффективности, а варить по
  // своей: гид сказал бы «засыпьте 3.85 кг», а со склада ушло бы 3.33 кг.
  const efficiencyFactor = readBrewPlanEfficiencyFactor(batch.brewPlanSnapshot);

  await db.transaction(async (tx) => {
    const locked = await lockBrewBatchRow(tx, userId, brewBatchId);
    // Статус перечитываем ПОД блокировкой: прочитанный до транзакции он мог
    // протухнуть (варку завершили/отменили в соседней вкладке, пока мы ждали лок),
    // и списание уезжало в терминальную партию — вернуть его оттуда уже нечем.
    if (locked.status === "cancelled" || locked.status === "completed") {
      throw new Error("INVALID_STATUS");
    }
    // Гейт — уже ПОД блокировкой: конкурент, дождавшись коммита первого запроса,
    // увидит его consumed-аллокации и честно получит ALREADY_CONSUMED.
    if (await hasConsumedAllocationsForBatch(userId, brewBatchId, tx)) {
      throw new Error("ALREADY_CONSUMED");
    }

    await autoAllocateRecipeInventoryFromStock(userId, recipeId, {
      brewBatchId,
      targetBatchVolumeL,
      efficiencyFactor,
      client: tx
    });
    await consumeRecipeInventoryAllocations(userId, recipeId, {
      brewBatchId,
      targetBatchVolumeL,
      efficiencyFactor,
      client: tx
    });
  });

  return buildView(userId, brewBatchId, recipeId);
};

/**
 * Вернуть списанное этой партией на склад (откат при отмене/по кнопке). Реверс
 * нетто-списания: каждой позиции добавляем недостающее, пишем компенсирующую
 * release-транзакцию, и возвращаем потреблённые этой партией аллокации в
 * released (чтобы покрытие рецепта согласовалось и повторное списание было
 * возможно). Идемпотентно (после возврата нетто = 0). Возвращает число
 * фактически возвращённых позиций — для честного сообщения.
 *
 * Журнал читается ВНУТРИ транзакции под блокировкой строки партии, остатки — под
 * `FOR UPDATE`: иначе два перекрывающихся возврата (двойной клик, отмена варки
 * параллельно с кнопкой) оба видели нетто «−4 кг» и возвращали по 4 кг — склад
 * рос из воздуха.
 */
export const restoreBrewBatchInventory = async (
  userId: string,
  brewBatchId: string
): Promise<{ view: BrewBatchInventoryView; restoredItemCount: number }> => {
  const batch = await getBrewBatchById(userId, brewBatchId);
  if (!batch) {
    throw new Error("NOT_FOUND");
  }

  let restoredItemCount = 0;

  await db.transaction(async (tx) => {
    await lockBrewBatchRow(tx, userId, brewBatchId);

    const transactions = await loadBatchTransactions(userId, brewBatchId, tx);
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
    const directConsumedAllocations = await loadBatchConsumedAllocations(userId, brewBatchId, tx);
    const consumedAllocationIds = [...new Set([
      ...legacyConsumedAllocationIds,
      ...directConsumedAllocations.map((allocation) => allocation.id)
    ])];

    const now = new Date();
    // Порядок обхода = порядок захвата блокировок складских строк, и он должен
    // совпадать с порядком списания (consumeRecipeInventoryAllocations сортирует по
    // позиции склада). По журналу порядок иной — createdAt: два возврата разных
    // партий, поделивших один солод, брали бы строки встречно и вставали в дедлок
    // (Postgres убивает одну транзакцию — пользователь получает 500 на «Вернуть»).
    const restoreOrder = [...net.entries()].sort(([left], [right]) => left.localeCompare(right));
    for (const [inventoryItemId, entry] of restoreOrder) {
      if (entry.delta >= -CONSUME_EPSILON) {
        continue;
      }
      const restoreAmount = roundTo(-entry.delta, 3);
      // Остаток — под блокировкой строки (как в consumeRecipeInventoryAllocations):
      // возврат тоже пишет абсолютное значение и без блокировки затирает чужую запись.
      const [item] = await tx
        .select({
          id: userIngredients.id,
          normalizedQuantity: userIngredients.normalizedQuantity,
          normalizedUnit: userIngredients.normalizedUnit,
          enteredQuantity: userIngredients.enteredQuantity,
          enteredUnit: userIngredients.enteredUnit,
          packageVariantId: userIngredients.packageVariantId,
          ingredientCatalogItemId: userIngredients.ingredientCatalogItemId,
          userCustomIngredientId: userIngredients.userCustomIngredientId
        })
        .from(userIngredients)
        .where(and(eq(userIngredients.id, inventoryItemId), eq(userIngredients.userId, userId)))
        .for("update");
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
      // Курс «пачка → содержимое» нужен позиции, которую вводили не в нормализованной
      // единице: без него entered_quantity пачечной позиции застревал на нуле после
      // возврата (normalized_quantity восстанавливался, а обратный пересчёт 11 г → 1
      // пачка без курса не считается).
      const packEquivalent = item.enteredUnit !== item.normalizedUnit
        ? await loadInventoryItemPackEquivalent(item, tx)
        : null;
      const enteredQuantity = convertNormalizedQuantityToEnteredUnit(
        quantityAfter,
        item.normalizedUnit,
        item.enteredUnit,
        packEquivalent
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
