import {
  and,
  db,
  eq,
  inArray,
  ingredientPackageVariants,
  ingredients,
  inventoryTransactions,
  isNull,
  recipeIngredients,
  recipeInventoryAllocations,
  recipes,
  userCustomIngredients,
  userIngredients
} from "@nb/db";
import { roundTo } from "@nb/brewing-core";

import {
  type RecipeStockCoverageDto,
  type RecipeStockCoverageLineDto
} from "./contracts";
import { resolveBatchScaleFactor, safeRecipeBatchVolumeL } from "./batch-scale";
import { resolveLineScaleFactor } from "./scale";
import { isRecipePubliclyVisible } from "./visibility";
import { extractIngredientTechnicalData } from "../ingredients/technical-fields";
import {
  convertInventoryNormalizedToUnit,
  convertQuantityToInventoryNormalizedUnit,
  resolveInventoryItemPackEquivalent,
  type InventoryPackEquivalent
} from "../inventory/pack";
import { parseInventoryUnit, type InventoryUnit } from "../inventory/units";

type RecipeLineRow = typeof recipeIngredients.$inferSelect;
type InventoryItemRow = typeof userIngredients.$inferSelect;

/**
 * db или открытая транзакция. Списание варкой обязано держать гейт «уже списано?»,
 * подбор и сам consume в ОДНОМ транзакционном периметре (см.
 * features/brew-batches/inventory.ts): иначе два перекрывающихся запроса (две
 * вкладки, ретрай) оба проходят гейт и списывают склад дважды. Поэтому каждая
 * функция движка умеет работать на переданной транзакции, а не только на db.
 *
 * Ходить в БД мимо переданного клиента внутри чужой транзакции нельзя: это другое
 * соединение пула — оно не видит незакоммиченных строк и может встать в очередь за
 * блокировкой, которую держит вызвавшая транзакция.
 */
type DbTransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type InventoryDbClient = typeof db | DbTransactionClient;

// db.transaction открывает транзакцию, tx.transaction — SAVEPOINT внутри уже
// открытой: в обоих случаях тело выполняется атомарно и в том же периметре.
const runInTransaction = async <T>(
  client: InventoryDbClient,
  body: (tx: DbTransactionClient) => Promise<T>
): Promise<T> => client.transaction(async (tx) => body(tx));

type ScopedOptions = {
  /** Партия-владелец аллокаций. NULL — «вне партии» (дев-скрипты, легаси). */
  brewBatchId?: string | null;
  /**
   * Объём ПАРТИИ, л. Потребность строк пересчитывается под него — тем же фактором,
   * что и в матче (features/recipes/batch-scale.ts). null/не передан → множитель 1
   * (количества рецепта как есть).
   */
  targetBatchVolumeL?: number | null;
  /**
   * Дожим ЗАСЫПИ под эффективность оборудования варщика (варим на 65%, автор считал
   * на 75% → солода ×1.154, чтобы попасть в его OG). Считает вызывающий — из плана
   * партии (readBrewPlanEfficiencyFactor) или из дефолтного профиля вне партии;
   * ровно тот же множитель уже зашит в снапшот варки. Применяется ТОЛЬКО к строкам,
   * на которые действует эффективность затирания (солод/зерновые добавки), не к
   * сахару, хмелю и дрожжам. 1/не передан → дожима нет.
   */
  efficiencyFactor?: number | null;
  /** Транзакция вызывающего, если списание идёт под его блокировками. */
  client?: InventoryDbClient;
};

const CONSUME_EPSILON = 0.000001;

const activeAllocationStatuses = ["allocated", "reserved"] as const;
const visibleAllocationStatuses = ["allocated", "reserved", "consumed", "released"] as const;

/**
 * Область аллокаций: конкретная ПАРТИЯ варки или «вне партии» (brewBatchId=NULL —
 * дев-скрипты, легаси-записи редакторского списания).
 *
 * Аллокация принадлежит партии, а не рецепту. Один рецепт можно варить сколько
 * угодно раз, в том числе параллельно: каждая варка подбирает и списывает СВОИ
 * строки из ТЕКУЩЕГО остатка склада. Двойного списания это не создаёт — склад
 * уменьшается физически, и вторая варка берёт уже из уменьшенного остатка.
 * Идемпотентность нужна ровно одна: «одна и та же партия не списывает дважды» —
 * её и обеспечивает эта область (аллокации других партий в подбор/списание
 * партии B не попадают, а свои — попадают и потому не дублируются).
 */
const allocationBatchScope = (brewBatchId: string | null) => (
  brewBatchId
    ? eq(recipeInventoryAllocations.brewBatchId, brewBatchId)
    : isNull(recipeInventoryAllocations.brewBatchId)
);

/**
 * Списывала ли ЭТА партия ингредиенты со склада (есть ли у неё consumed-аллокации).
 * Возврат на склад (restoreBrewBatchInventory) переводит их в released → флаг
 * снова false, и партию можно списать заново.
 */
export const hasConsumedAllocationsForBatch = async (
  userId: string,
  brewBatchId: string,
  client: InventoryDbClient = db
): Promise<boolean> => {
  const consumed = await client.query.recipeInventoryAllocations.findMany({
    where: and(
      eq(recipeInventoryAllocations.userId, userId),
      eq(recipeInventoryAllocations.brewBatchId, brewBatchId),
      eq(recipeInventoryAllocations.status, "consumed")
    ),
    columns: { id: true }
  });

  return consumed.length > 0;
};

// Рецепт, из которого МОЖНО списывать склад на варку: свой (любой статус) ИЛИ
// чужой published — чтобы варить без клонирования. Ownership не требует, но
// вызывающий обязан НЕ мутировать поля чужого рецепта (см. autoAllocate: selection-
// meta пишем только своему). Возвращает authorId (проверка «свой ли рецепт») и
// объём рецепта (база пересчёта количеств под объём партии).
const ensureBrewableRecipe = async (userId: string, recipeId: string, client: InventoryDbClient = db) => {
  const recipe = await client.query.recipes.findFirst({
    where: eq(recipes.id, recipeId),
    columns: {
      id: true,
      authorId: true,
      publicationState: true,
      hiddenAt: true,
      batchSizeNormalizedQuantity: true,
      batchSizeNormalizedUnit: true
    }
  });

  if (!recipe) {
    throw new Error("NOT_FOUND");
  }

  if (recipe.authorId !== userId && !isRecipePubliclyVisible(recipe)) {
    throw new Error("FORBIDDEN");
  }

  return recipe;
};

/**
 * Множитель количеств рецепта под объём партии — ровно тот же, которым матч
 * считает потребность (features/recipes/batch-scale.ts). Объём партии неизвестен
 * → 1: списываем рецепт как есть, как и матч в этом случае.
 */
const resolveRecipeScaleFactor = (
  recipe: { batchSizeNormalizedQuantity: number; batchSizeNormalizedUnit: string },
  targetBatchVolumeL: number | null | undefined
): number => {
  if (!targetBatchVolumeL || targetBatchVolumeL <= 0) {
    return 1;
  }

  return resolveBatchScaleFactor(
    safeRecipeBatchVolumeL(recipe.batchSizeNormalizedQuantity, recipe.batchSizeNormalizedUnit),
    targetBatchVolumeL
  );
};

/**
 * Множитель КАЖДОЙ строки: объём — всем, объём × дожим эффективности — только
 * засыпи (см. features/recipes/scale.ts, тот же предикат, что у движка OG).
 * Техданные каталога догружаем одним запросом и ТОЛЬКО когда дожим реально есть —
 * без него старый путь не платит ни одного лишнего похода в БД.
 */
const buildLineScaleResolver = async (
  lines: RecipeLineRow[],
  volumeFactor: number,
  efficiencyFactor: number | null | undefined,
  client: InventoryDbClient
): Promise<(line: RecipeLineRow) => number> => {
  const dojim = efficiencyFactor && Number.isFinite(efficiencyFactor) && efficiencyFactor > 0
    ? efficiencyFactor
    : 1;
  if (dojim === 1) {
    return () => volumeFactor;
  }

  const catalogIds = [...new Set(
    lines
      .filter((line) => line.type === "malt" || line.type === "fermentable")
      .map((line) => line.ingredientCatalogItemId)
      .filter((id): id is string => Boolean(id))
  )];
  const catalogRows = catalogIds.length
    ? await client.query.ingredients.findMany({ where: inArray(ingredients.id, catalogIds) })
    : [];
  const technicalById = new Map(catalogRows.map((row) => [
    row.id,
    extractIngredientTechnicalData({ type: row.type, attributes: row.attributes })
  ]));

  return (line) => resolveLineScaleFactor(
    {
      type: line.type,
      // Кастомный ингредиент техданных каталога не имеет → предикат падает на тип
      // строки (malt = засыпь, fermentable = сахар/экстракт без дожима).
      technicalData: line.ingredientCatalogItemId
        ? technicalById.get(line.ingredientCatalogItemId) ?? null
        : null
    },
    volumeFactor,
    dojim
  );
};

const ensureOwnedInventoryItem = async (
  userId: string,
  inventoryItemId: string,
  client: InventoryDbClient = db
) => {
  const item = await client.query.userIngredients.findFirst({
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

const asAllocationMeta = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

// Клампленное списание (дрожжи, см. isPresenceBasedRecipeLine) кладёт сюда
// требование ДО обрезки по остатку — чтобы покрытие показывало «нужно было 22 г»,
// а не то, что удалось списать.
const readAllocationRequestedQuantity = (value: unknown) => {
  const requested = asAllocationMeta(value).requestedQuantityNormalized;
  return typeof requested === "number" && Number.isFinite(requested) && requested > 0 ? requested : null;
};

const inventorySourceMatchesRecipeLine = (
  line: RecipeLineRow,
  inventoryItem: InventoryItemRow
) => {
  const catalogMatches = line.ingredientCatalogItemId
    && inventoryItem.ingredientCatalogItemId
    && line.ingredientCatalogItemId === inventoryItem.ingredientCatalogItemId;
  const customMatches = line.userCustomIngredientId
    && inventoryItem.userCustomIngredientId
    && line.userCustomIngredientId === inventoryItem.userCustomIngredientId;

  return Boolean(catalogMatches || customMatches);
};

/**
 * Дрожжи покрываются НАЛИЧИЕМ штамма, а не количеством (см. presenceBased в
 * features/recipes/match-service.ts): пачка ≈ 11 г, объём всё равно наращивается
 * стартером. Отсюда правило списания: нехватка дрожжей не роняет варку — списываем
 * остаток (кламп) и помечаем аллокацию clamped.
 */
const isPresenceBasedRecipeLine = (line: RecipeLineRow | null) => (
  line?.ingredientCategory === "yeast" || line?.type === "yeast"
);

/** Поля складской позиции, по которым восстанавливается курс «пачка → содержимое». */
type PackEquivalentSource = Pick<
  InventoryItemRow,
  "packageVariantId" | "ingredientCatalogItemId" | "userCustomIngredientId"
>;

/**
 * Эквивалент пачки для складской позиции: вариант фасовки (если выбран) или
 * технические поля источника. Ходит в БД, поэтому вызывать только когда единицы
 * строки рецепта и складской позиции реально разошлись.
 */
export const loadInventoryItemPackEquivalent = async (
  item: PackEquivalentSource,
  client: InventoryDbClient = db
): Promise<InventoryPackEquivalent | null> => {
  const [packageVariant, catalogItem, customItem] = await Promise.all([
    item.packageVariantId
      ? client.query.ingredientPackageVariants.findFirst({
        where: eq(ingredientPackageVariants.id, item.packageVariantId)
      })
      : null,
    item.ingredientCatalogItemId
      ? client.query.ingredients.findFirst({
        where: eq(ingredients.id, item.ingredientCatalogItemId)
      })
      : null,
    item.userCustomIngredientId
      ? client.query.userCustomIngredients.findFirst({
        where: eq(userCustomIngredients.id, item.userCustomIngredientId)
      })
      : null
  ]);

  const technicalData = catalogItem
    ? extractIngredientTechnicalData({ type: catalogItem.type, attributes: catalogItem.attributes })
    : customItem
      ? extractIngredientTechnicalData(customItem)
      : null;

  return resolveInventoryItemPackEquivalent({
    packageVariant: packageVariant ?? null,
    technicalData
  });
};

/**
 * Сколько нужно списать со СКЛАДСКОЙ позиции под строку рецепта — в единице этой
 * позиции и под ОБЪЁМ ПАРТИИ (factor). Склад раскрывает пачку при записи
 * (1 pack → 11 г), рецепт хранит «пачку» как есть, поэтому строгое равенство
 * единиц здесь означало бы «дрожжи не списываются никогда». Совпали единицы —
 * отвечаем сразу, без похода в БД. null — конверсия невозможна (например,
 * расходник лежит в пачках с неизвестным содержимым).
 *
 * Округление до 3 знаков — ДО конверсии и в единице строки: ровно так же считает
 * матч (matchLineAgainstInventory), иначе «нужно» и «списали» разъезжались бы в
 * последнем знаке.
 */
const resolveRequiredQuantityInInventoryItemUnit = async (
  line: RecipeLineRow,
  inventoryItem: InventoryItemRow,
  factor: number,
  client: InventoryDbClient
): Promise<number | null> => {
  const lineUnit = parseInventoryUnit(line.amountNormalizedUnit);
  const itemUnit = parseInventoryUnit(inventoryItem.normalizedUnit);

  if (!lineUnit || !itemUnit) {
    return null;
  }

  const requiredInLineUnit = roundTo(line.amountNormalizedQuantity * factor, 3);

  if (lineUnit === itemUnit) {
    return requiredInLineUnit;
  }

  const packEquivalent = await loadInventoryItemPackEquivalent(inventoryItem, client);
  return convertQuantityToInventoryNormalizedUnit(
    requiredInLineUnit,
    lineUnit,
    itemUnit,
    packEquivalent
  );
};

const inventoryItemCanCoverRecipeLine = async (
  line: RecipeLineRow,
  inventoryItem: InventoryItemRow,
  factor: number,
  client: InventoryDbClient
) => (
  inventorySourceMatchesRecipeLine(line, inventoryItem)
  && (await resolveRequiredQuantityInInventoryItemUnit(line, inventoryItem, factor, client)) != null
);

/**
 * Требуемое количество под строку рецепта в единице складской позиции — с
 * проверками источника и конвертируемости (для явного выбора позиции).
 */
const resolveRecipeLineAllocationQuantity = async (
  line: RecipeLineRow,
  inventoryItem: InventoryItemRow,
  factor: number,
  client: InventoryDbClient
): Promise<number> => {
  if (!inventorySourceMatchesRecipeLine(line, inventoryItem)) {
    throw new Error("INCOMPATIBLE_INVENTORY_SOURCE");
  }

  const requiredQuantity = await resolveRequiredQuantityInInventoryItemUnit(line, inventoryItem, factor, client);
  if (requiredQuantity == null) {
    throw new Error("INCOMPATIBLE_UNIT");
  }

  return requiredQuantity;
};

const findOwnedInventoryItemByRecipeLineSource = async (
  userId: string,
  line: RecipeLineRow,
  factor: number,
  client: InventoryDbClient
) => {
  const sourceFilter = line.ingredientCatalogItemId
    ? eq(userIngredients.ingredientCatalogItemId, line.ingredientCatalogItemId)
    : line.userCustomIngredientId
      ? eq(userIngredients.userCustomIngredientId, line.userCustomIngredientId)
      : null;

  if (!sourceFilter) {
    return null;
  }

  const candidates = await client.query.userIngredients.findMany({
    where: and(
      eq(userIngredients.userId, userId),
      sourceFilter
    )
  });

  const usable: InventoryItemRow[] = [];
  for (const item of candidates) {
    if (item.archivedAt) {
      continue;
    }

    if (await inventoryItemCanCoverRecipeLine(line, item, factor, client)) {
      usable.push(item);
    }
  }

  return usable
    .sort((left, right) => (
      right.normalizedQuantity - left.normalizedQuantity
      || right.updatedAt.getTime() - left.updatedAt.getTime()
    ))[0] ?? null;
};

const resolveOwnedInventoryItemForRecipeLine = async (
  userId: string,
  line: RecipeLineRow,
  inventoryItemId: string | null,
  factor: number,
  client: InventoryDbClient
) => {
  if (inventoryItemId) {
    const selected = await client.query.userIngredients.findFirst({
      where: and(eq(userIngredients.id, inventoryItemId), eq(userIngredients.userId, userId))
    });

    if (selected && !selected.archivedAt && await inventoryItemCanCoverRecipeLine(line, selected, factor, client)) {
      return selected;
    }
  }

  return findOwnedInventoryItemByRecipeLineSource(userId, line, factor, client);
};

const updateRecipeLineInventorySelectionMeta = async (
  line: typeof recipeIngredients.$inferSelect,
  inventoryItem: typeof userIngredients.$inferSelect,
  client: InventoryDbClient
) => {
  const currentMeta = line.inventorySelectionMeta && typeof line.inventorySelectionMeta === "object" && !Array.isArray(line.inventorySelectionMeta)
    ? line.inventorySelectionMeta
    : {};

  if ((currentMeta as { inventoryItemId?: unknown }).inventoryItemId === inventoryItem.id) {
    return;
  }

  await client.update(recipeIngredients).set({
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

/**
 * Покрытие строк рецепта складом В ОБЛАСТИ ОДНОЙ ПАРТИИ (или вне партии, если
 * brewBatchId не передан): показываем только аллокации этой области, поэтому
 * списание соседней варки того же рецепта не подменяет картину.
 */
export const listRecipeStockCoverage = async (
  userId: string,
  recipeId: string,
  options: ScopedOptions = {}
): Promise<RecipeStockCoverageDto> => {
  const client = options.client ?? db;
  // Покрытие читают и на варке ЧУЖОГО published-рецепта (варка без клона), поэтому
  // гейт — «можно ли из него варить», а не «мой ли он»: иначе списание падало бы с
  // NOT_FOUND уже ПОСЛЕ создания аллокаций. Аллокации всё равно фильтруются по userId.
  const recipe = await ensureBrewableRecipe(userId, recipeId, client);
  const volumeFactor = resolveRecipeScaleFactor(recipe, options.targetBatchVolumeL);
  const brewBatchId = options.brewBatchId ?? null;
  const [lines, allocations] = await Promise.all([
    client.query.recipeIngredients.findMany({
      where: eq(recipeIngredients.recipeId, recipeId)
    }),
    client.query.recipeInventoryAllocations.findMany({
      where: and(
        eq(recipeInventoryAllocations.userId, userId),
        eq(recipeInventoryAllocations.recipeId, recipeId),
        allocationBatchScope(brewBatchId),
        inArray(recipeInventoryAllocations.status, [...visibleAllocationStatuses])
      )
    })
  ]);
  const inventoryIds = [...new Set(allocations.map((allocation) => allocation.inventoryItemId))];
  const inventoryRows = inventoryIds.length
    ? await client.query.userIngredients.findMany({
      where: and(
        eq(userIngredients.userId, userId),
        inArray(userIngredients.id, inventoryIds)
      )
    })
    : [];
  const inventoryById = new Map(inventoryRows.map((item) => [item.id, item]));
  const scaleLine = await buildLineScaleResolver(lines, volumeFactor, options.efficiencyFactor, client);
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
      const lineUnit = parseUnitOrThrow(line.amountNormalizedUnit);
      const allocatedQuantityNormalized = allocation?.allocatedQuantityNormalized ?? 0;
      const availableQuantityNormalized = inventoryItem?.normalizedQuantity ?? null;
      const inventoryDisplayName = inventoryItem?.ingredientDisplayNameSnapshot ?? null;
      // Есть аллокация → и требование, и остаток выражаем в её единице (= единице
      // складской позиции). Иначе сравнивали бы «11 г доступно» с «1 пачка нужна».
      // Клампленное списание (дрожжи) хранит исходное требование в мете — показываем
      // его, а не то, что реально удалось списать. Строка без аллокации — требование
      // рецепта под объём партии (тот же множитель, что у подбора и у матча).
      const requiredQuantityNormalized = allocation
        ? readAllocationRequestedQuantity(allocation.allocationMeta) ?? allocation.allocatedQuantityNormalized
        : roundTo(line.amountNormalizedQuantity * scaleLine(line), 3);
      const requiredNormalizedUnit = allocation
        ? parseUnitOrThrow(allocation.allocatedNormalizedUnit)
        : lineUnit;

      return {
        recipeIngredientId: line.id,
        recipeIngredientPersistentKey: line.persistentKey,
        displayOrder: line.displayOrder ?? 0,
        ingredientDisplayName: line.ingredientDisplayNameSnapshot ?? null,
        requiredQuantityNormalized,
        requiredNormalizedUnit,
        allocatedQuantityNormalized,
        availableQuantityNormalized,
        normalizedUnit: requiredNormalizedUnit,
        status: resolveCoverageStatus({
          allocationStatus: allocation?.status ?? null,
          allocatedQuantityNormalized,
          requiredQuantityNormalized,
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

// Общее тело аллокации строки на конкретную складскую позицию: факт масштаба
// (factor) уже посчитан вызывающим, рецепт проверен. Отдельно от публичной
// allocateRecipeIngredientFromInventory, чтобы автоподбор не перечитывал рецепт
// и не пересчитывал фактор на каждой строке.
const allocateRecipeLineFromInventoryItem = async (input: {
  userId: string;
  recipeId: string;
  line: RecipeLineRow;
  inventoryItem: InventoryItemRow;
  brewBatchId: string | null;
  factor: number;
  client: InventoryDbClient;
}) => {
  const requiredQuantity = await resolveRecipeLineAllocationQuantity(
    input.line,
    input.inventoryItem,
    input.factor,
    input.client
  );
  // Аллокация ВСЕГДА живёт в единице складской позиции (как она лежит в БД):
  // на этом держатся списание, возврат партии и резервы — они сравнивают единицу
  // аллокации с единицей позиции напрямую.
  const converted = input.line.amountNormalizedUnit !== input.inventoryItem.normalizedUnit;
  const scaled = input.factor !== 1;

  await runInTransaction(input.client, async (tx) => {
    const now = new Date();

    // Освобождаем прежнюю активную аллокацию ТОЛЬКО в своей области: активная
    // аллокация другой партии — её резерв на её же варку, трогать нельзя.
    await tx.update(recipeInventoryAllocations).set({
      status: "released",
      releasedAt: now,
      updatedAt: now
    }).where(and(
      eq(recipeInventoryAllocations.userId, input.userId),
      eq(recipeInventoryAllocations.recipeId, input.recipeId),
      eq(recipeInventoryAllocations.recipeIngredientId, input.line.id),
      allocationBatchScope(input.brewBatchId),
      inArray(recipeInventoryAllocations.status, [...activeAllocationStatuses])
    ));

    await tx.insert(recipeInventoryAllocations).values({
      userId: input.userId,
      recipeId: input.recipeId,
      recipeIngredientId: input.line.id,
      recipeIngredientPersistentKey: input.line.persistentKey,
      inventoryItemId: input.inventoryItem.id,
      brewBatchId: input.brewBatchId,
      status: "allocated",
      allocatedQuantityNormalized: requiredQuantity,
      allocatedNormalizedUnit: input.inventoryItem.normalizedUnit,
      allocationMeta: {
        source: "recipe_selection",
        ingredientDisplayName: input.line.ingredientDisplayNameSnapshot ?? null,
        // След конверсии «пачка рецепта → граммы склада» — для аудита расхождений.
        ...(converted
          ? {
            sourceNormalizedQuantity: input.line.amountNormalizedQuantity,
            sourceNormalizedUnit: input.line.amountNormalizedUnit
          }
          : {}),
        // След пересчёта под объём партии — там же, где след конверсии единиц:
        // по мете аллокации всегда видно, из чего сложилось списанное число.
        ...(scaled ? { batchScaleFactor: roundTo(input.factor, 4) } : {})
      }
    });
  });
};

export const allocateRecipeIngredientFromInventory = async (input: {
  userId: string;
  recipeId: string;
  recipeIngredientPersistentKey: string;
  inventoryItemId: string;
} & ScopedOptions) => {
  const client = input.client ?? db;
  const recipe = await ensureBrewableRecipe(input.userId, input.recipeId, client);
  const volumeFactor = resolveRecipeScaleFactor(recipe, input.targetBatchVolumeL);
  const brewBatchId = input.brewBatchId ?? null;
  const [line, inventoryItem] = await Promise.all([
    client.query.recipeIngredients.findFirst({
      where: and(
        eq(recipeIngredients.recipeId, input.recipeId),
        eq(recipeIngredients.persistentKey, input.recipeIngredientPersistentKey)
      )
    }),
    ensureOwnedInventoryItem(input.userId, input.inventoryItemId, client)
  ]);

  if (!line) {
    throw new Error("NOT_FOUND");
  }

  const scaleLine = await buildLineScaleResolver([line], volumeFactor, input.efficiencyFactor, client);
  await allocateRecipeLineFromInventoryItem({
    userId: input.userId,
    recipeId: input.recipeId,
    line,
    inventoryItem,
    brewBatchId,
    factor: scaleLine(line),
    client
  });
};

/**
 * Авто-подбор склада под ВСЕ строки рецепта по совпадению источника (каталог/
 * кастом + единица), независимо от inventoryIntentMode. Единственный подборщик:
 * прежний syncRecipeSelectedInventoryAllocations (только строки use_stock, вызывался
 * кнопкой «Обновить наличие» в редакторе) снесён вместе с редакторским списанием —
 * autoAllocate его надмножество, он тоже уважает выбранный в пикере лот
 * (inventorySelectionMeta).
 *
 * Подбор идёт В ОБЛАСТИ ПАРТИИ (см. allocationBatchScope): пропускаем строки, у
 * которых уже есть активная или потреблённая аллокация ЭТОЙ ЖЕ партии (повторный
 * клик не двоит списание). Аллокации ДРУГИХ партий подбор не блокируют — вторая
 * варка того же рецепта берёт своё из текущего остатка. Без подходящей позиции на
 * складе строка пропускается. Возвращает покрытие этой же области.
 */
export const autoAllocateRecipeInventoryFromStock = async (
  userId: string,
  recipeId: string,
  options: ScopedOptions = {}
): Promise<RecipeStockCoverageDto> => {
  const client = options.client ?? db;
  const recipe = await ensureBrewableRecipe(userId, recipeId, client);
  const volumeFactor = resolveRecipeScaleFactor(recipe, options.targetBatchVolumeL);
  const isOwnRecipe = recipe.authorId === userId;
  const brewBatchId = options.brewBatchId ?? null;
  const [lines, ownAllocations] = await Promise.all([
    client.query.recipeIngredients.findMany({
      where: eq(recipeIngredients.recipeId, recipeId)
    }),
    client.query.recipeInventoryAllocations.findMany({
      where: and(
        eq(recipeInventoryAllocations.userId, userId),
        eq(recipeInventoryAllocations.recipeId, recipeId),
        allocationBatchScope(brewBatchId),
        inArray(recipeInventoryAllocations.status, ["allocated", "reserved", "consumed"])
      )
    })
  ]);
  const allocatedLineIds = new Set(ownAllocations.map((allocation) => allocation.recipeIngredientId));
  const scaleLine = await buildLineScaleResolver(lines, volumeFactor, options.efficiencyFactor, client);

  for (const line of lines) {
    if (allocatedLineIds.has(line.id)) {
      continue;
    }
    // Уважаем лот, выбранный автором в пикере (inventorySelectionMeta): без этого
    // варка брала лот с наибольшим остатком, игнорируя явный выбор.
    const inventoryItem = await resolveOwnedInventoryItemForRecipeLine(
      userId,
      line,
      readInventoryItemIdFromMeta(line.inventorySelectionMeta),
      scaleLine(line),
      client
    );
    if (!inventoryItem) {
      continue;
    }
    // Selection-meta — UX-подсказка редактора «какая позиция склада закрывает
    // строку». Пишем ТОЛЬКО в свой рецепт: варка чужого не должна мутировать его
    // строки/updatedAt (и порядок в витрине). Аллокация — user-scoped, её пишем всегда.
    if (isOwnRecipe) {
      await updateRecipeLineInventorySelectionMeta(line, inventoryItem, client);
    }
    await allocateRecipeLineFromInventoryItem({
      userId,
      recipeId,
      line,
      inventoryItem,
      brewBatchId,
      factor: scaleLine(line),
      client
    });
  }

  return listRecipeStockCoverage(userId, recipeId, options);
};

export const reserveRecipeInventoryAllocations = async (
  userId: string,
  recipeId: string,
  options: ScopedOptions = {}
): Promise<RecipeStockCoverageDto> => {
  const client = options.client ?? db;
  await ensureBrewableRecipe(userId, recipeId, client);
  const brewBatchId = options.brewBatchId ?? null;
  const now = new Date();
  await client.update(recipeInventoryAllocations).set({
    status: "reserved",
    reservedAt: now,
    updatedAt: now
  }).where(and(
    eq(recipeInventoryAllocations.userId, userId),
    eq(recipeInventoryAllocations.recipeId, recipeId),
    allocationBatchScope(brewBatchId),
    eq(recipeInventoryAllocations.status, "allocated")
  ));

  return listRecipeStockCoverage(userId, recipeId, options);
};

export const releaseRecipeInventoryAllocations = async (
  userId: string,
  recipeId: string,
  options: ScopedOptions = {}
): Promise<RecipeStockCoverageDto> => {
  const client = options.client ?? db;
  await ensureBrewableRecipe(userId, recipeId, client);
  const brewBatchId = options.brewBatchId ?? null;
  const now = new Date();
  await client.update(recipeInventoryAllocations).set({
    status: "released",
    releasedAt: now,
    updatedAt: now
  }).where(and(
    eq(recipeInventoryAllocations.userId, userId),
    eq(recipeInventoryAllocations.recipeId, recipeId),
    allocationBatchScope(brewBatchId),
    inArray(recipeInventoryAllocations.status, [...activeAllocationStatuses])
  ));

  return listRecipeStockCoverage(userId, recipeId, options);
};

/**
 * Нормализованный остаток в единице, которой пользователь вводил позицию
 * («2 пачки»), чтобы entered_quantity не протухала после списания. Для пачки
 * нужен packEquivalent — без него вернём null, и поле останется прежним.
 */
export const convertNormalizedQuantityToEnteredUnit = (
  normalizedQuantity: number,
  normalizedUnit: string,
  enteredUnit: string,
  packEquivalent?: InventoryPackEquivalent | null
) => {
  const fromUnit = parseInventoryUnit(normalizedUnit);
  const toUnit = parseInventoryUnit(enteredUnit);

  if (!fromUnit || !toUnit) {
    return null;
  }

  return convertInventoryNormalizedToUnit(normalizedQuantity, fromUnit, toUnit, packEquivalent ?? null);
};

/**
 * Списать со склада активные аллокации ЭТОЙ партии (или аллокации вне партии, если
 * brewBatchId не передан). Область — базовая защита от двойного списания: повторный
 * вызов для той же партии активных аллокаций уже не найдёт (они стали consumed) и
 * склад не тронет, а аллокации соседних варок того же рецепта сюда не попадают вовсе.
 *
 * От ГОНКИ (две вкладки, ретрай — оба запроса стартовали до того, как первый
 * закоммитил) защищает не область, а транзакция:
 *  - остаток читаем строкой ПОД `FOR UPDATE`, а не «прочитал → посчитал → записал
 *    абсолютное значение» (классический lost update: второй писал остаток от
 *    устаревшего чтения);
 *  - аллокацию переводим в consumed УСЛОВНО (`WHERE status IN (активные)`), и склад
 *    трогаем, только если этот UPDATE реально забрал строку. Конкурент, проснувшись
 *    на блокировке, увидит статус consumed, заберёт 0 строк и склад не тронет;
 *  - аллокации обходим в порядке складских позиций — одинаковый порядок захвата
 *    блокировок у всех конкурентов, иначе взаимоблокировка на встречных парах позиций.
 *
 * Вызов из варки (features/brew-batches/inventory.ts) дополнительно накрывает
 * гейт+подбор+consume общей транзакцией с блокировкой строки партии — там же лежит
 * защита от «оба подобрали свои аллокации на одну и ту же строку рецепта».
 */
export const consumeRecipeInventoryAllocations = async (
  userId: string,
  recipeId: string,
  options: ScopedOptions = {}
): Promise<RecipeStockCoverageDto> => {
  const client = options.client ?? db;
  await ensureBrewableRecipe(userId, recipeId, client);
  const brewBatchId = options.brewBatchId ?? null;

  await runInTransaction(client, async (tx) => {
    const [allocations, lines] = await Promise.all([
      tx.query.recipeInventoryAllocations.findMany({
        where: and(
          eq(recipeInventoryAllocations.userId, userId),
          eq(recipeInventoryAllocations.recipeId, recipeId),
          allocationBatchScope(brewBatchId),
          inArray(recipeInventoryAllocations.status, [...activeAllocationStatuses])
        ),
        // Порядок обхода = порядок захвата блокировок складских строк. Сортируем по
        // ПОЗИЦИИ СКЛАДА (а не по id аллокации): тогда любые два конкурентных
        // списания — даже разных партий, поделивших один пакет солода, — берут
        // строки в одном и том же порядке и не встают во встречные блокировки.
        orderBy: (table, { asc }) => [asc(table.inventoryItemId), asc(table.id)]
      }),
      tx.query.recipeIngredients.findMany({
        where: eq(recipeIngredients.recipeId, recipeId)
      })
    ]);
    const lineById = new Map(lines.map((line) => [line.id, line]));
    const now = new Date();

    // Одна строка рецепта = одно требование. Две активные аллокации на одну строку
    // в одной области — след гонки подбора (уникального индекса на
    // (brew_batch_id, recipe_ingredient_id) в схеме нет); списывать по обеим значило
    // бы взять со склада вдвое. Первую (по id) проводим, дубли гасим в released.
    const byLine = new Map<string, typeof allocations>();
    for (const allocation of allocations) {
      const bucket = byLine.get(allocation.recipeIngredientId) ?? [];
      bucket.push(allocation);
      byLine.set(allocation.recipeIngredientId, bucket);
    }
    const duplicateIds = [...byLine.values()].flatMap((bucket) => bucket.slice(1).map((allocation) => allocation.id));
    if (duplicateIds.length > 0) {
      console.error("[recipes] consume: duplicate active allocations for one recipe line, releasing extras", {
        recipeId,
        brewBatchId,
        duplicateIds
      });
      await tx.update(recipeInventoryAllocations).set({
        status: "released",
        releasedAt: now,
        updatedAt: now
      }).where(and(
        eq(recipeInventoryAllocations.userId, userId),
        inArray(recipeInventoryAllocations.id, duplicateIds),
        inArray(recipeInventoryAllocations.status, [...activeAllocationStatuses])
      ));
    }

    for (const allocation of [...byLine.values()].map((bucket) => bucket[0]!)) {
      // Остаток — ПОД блокировкой строки: до коммита конкурента мы сюда не пройдём,
      // а пройдя — прочитаем уже его результат (как в features/inventory/service.ts).
      const [locked] = await tx
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
        .where(and(
          eq(userIngredients.id, allocation.inventoryItemId),
          eq(userIngredients.userId, userId)
        ))
        .for("update");

      if (!locked) {
        throw new Error("NOT_FOUND");
      }

      const allocationUnit = parseInventoryUnit(allocation.allocatedNormalizedUnit);
      const itemUnit = parseInventoryUnit(locked.normalizedUnit);
      if (!allocationUnit || !itemUnit || allocationUnit !== itemUnit) {
        throw new Error("INCOMPATIBLE_UNIT");
      }

      const requestedQuantity = allocation.allocatedQuantityNormalized;
      const availableQuantity = Math.max(0, locked.normalizedQuantity);
      const isShort = availableQuantity + CONSUME_EPSILON < requestedQuantity;
      const line = lineById.get(allocation.recipeIngredientId) ?? null;

      // Нехватка дрожжей не роняет варку (матч у них по наличию штамма): списываем
      // остаток и метим аллокацию clamped. Для остальных категорий нехватка — ошибка,
      // иначе списание молча разошлось бы с рецептом.
      if (isShort && !isPresenceBasedRecipeLine(line)) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      const consumedQuantity = isShort ? roundTo(availableQuantity, 3) : requestedQuantity;
      // Списывать нечего (позиция пуста): аллокацию не трогаем — пусть покрытие
      // честно показывает «не хватает», а не «списано 0».
      if (consumedQuantity <= 0) {
        continue;
      }

      // Заявка на списание. Условие по статусу — атомарный «замок»: если конкурент
      // уже провёл эту аллокацию, строк не обновится ни одной и склад мы не тронем.
      const claimed = await tx.update(recipeInventoryAllocations).set({
        status: "consumed",
        // brewBatchId здесь не трогаем: аллокация принадлежит партии с рождения
        // (её проставляет подбор), а выборка выше и так отфильтрована по этой
        // партии — возврат партии и кредиты читают именно это поле.
        // Аллокация фиксирует РЕАЛЬНО списанное: на ней держатся возврат партии и
        // кредит нехватки, поэтому при клампе она ужимается до остатка.
        allocatedQuantityNormalized: consumedQuantity,
        allocationMeta: isShort
          ? {
            ...asAllocationMeta(allocation.allocationMeta),
            clamped: true,
            requestedQuantityNormalized: requestedQuantity
          }
          : asAllocationMeta(allocation.allocationMeta),
        consumedAt: now,
        updatedAt: now
      }).where(and(
        eq(recipeInventoryAllocations.id, allocation.id),
        inArray(recipeInventoryAllocations.status, [...activeAllocationStatuses])
      )).returning({ id: recipeInventoryAllocations.id });

      if (claimed.length === 0) {
        continue;
      }

      const quantityBefore = locked.normalizedQuantity;
      // Округление остатка при клампе может дать «минус пылинку» — в ноль его.
      const quantityAfter = Math.max(0, roundTo(quantityBefore - consumedQuantity, 3));
      // Курс «пачка → содержимое» нужен только позиции, которую вводили не в
      // нормализованной единице («2 пачки» → 22 г): без него entered_quantity
      // протухнет после списания.
      const packEquivalent = locked.enteredUnit !== locked.normalizedUnit
        ? await loadInventoryItemPackEquivalent(locked, tx)
        : null;
      const enteredQuantity = convertNormalizedQuantityToEnteredUnit(
        quantityAfter,
        locked.normalizedUnit,
        locked.enteredUnit,
        packEquivalent
      );

      await tx.update(userIngredients).set({
        normalizedQuantity: quantityAfter,
        enteredQuantity: enteredQuantity == null ? locked.enteredQuantity : roundTo(enteredQuantity, 3),
        updatedAt: now
      }).where(eq(userIngredients.id, locked.id));

      await tx.insert(inventoryTransactions).values({
        userId,
        inventoryItemId: locked.id,
        recipeId,
        recipeIngredientId: allocation.recipeIngredientId,
        brewBatchId,
        type: "consume",
        quantityDeltaNormalized: -consumedQuantity,
        normalizedUnit: locked.normalizedUnit,
        quantityBeforeNormalized: quantityBefore,
        quantityAfterNormalized: quantityAfter,
        transactionMeta: {
          allocationId: allocation.id,
          recipeIngredientPersistentKey: allocation.recipeIngredientPersistentKey
        }
      });
    }
  });

  return listRecipeStockCoverage(userId, recipeId, options);
};
