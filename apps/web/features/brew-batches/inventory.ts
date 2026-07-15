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
  buildBrewBatchConsumeLinePlanEntries,
  consumeRecipeInventoryAllocations,
  convertNormalizedQuantityToEnteredUnit,
  hasConsumedAllocationsForBatch,
  isPresenceBasedRecipeLine,
  loadInventoryItemPackEquivalent,
  type InventoryDbClient
} from "../recipes/inventory-service";
import { readBrewPlanBatchVolumeL, readBrewPlanEfficiencyFactor } from "../recipes/batch-scale";
import { formatInventoryQuantityForDisplay } from "../inventory/display";
import { parseInventoryUnit } from "../inventory/units";
import type { IngredientCategory, IngredientTechnicalData, IngredientType } from "../ingredients/contracts";
import { getBrewBatchById } from "./service";
import type {
  BrewBatchConsumePlan,
  BrewBatchConsumePlanCandidate,
  BrewBatchConsumePlanLine,
  BrewBatchConsumeSubstitution,
  BrewBatchInventoryConsumedLine,
  BrewBatchInventoryConsumeResult,
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
type ItemRequirement = {
  requiredNormalized: number;
  unit: string;
  clamped: boolean;
  /** Ф2: имя ИСХОДНОЙ строки рецепта, если позиция списана как ЗАМЕНА. */
  substitutedForDisplayName: string | null;
};

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
    const substitutedForDisplayName = typeof meta.substitutedForDisplayName === "string"
      ? meta.substitutedForDisplayName
      : null;
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
        clamped,
        substitutedForDisplayName
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
    current.substitutedForDisplayName = current.substitutedForDisplayName ?? substitutedForDisplayName;
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
        requiredQuantityNormalized,
        substitutedFor: requirement?.substitutedForDisplayName ?? null
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

// --- Ф2: предпросмотр списания с заменами по match-group ---------------------

// Человекочитаемое количество ("5 кг", "2 пачки") — существующим хелпером
// форматирования единиц (features/inventory/display.ts), не изобретаем своё.
const formatPlanQuantityLabel = (
  quantityNormalized: number,
  normalizedUnit: string,
  category: IngredientCategory | null,
  type: IngredientType | null,
  technicalData: IngredientTechnicalData | null
): string => {
  const unit = parseInventoryUnit(normalizedUnit) ?? "g";
  return formatInventoryQuantityForDisplay({
    enteredQuantity: quantityNormalized,
    enteredUnit: unit,
    normalizedQuantity: quantityNormalized,
    normalizedUnit: unit,
    category: category ?? undefined,
    type: type ?? undefined,
    technicalData
  });
};

const roundToOneDecimal = (value: number): number => Math.round(value * 10) / 10;

// "EBC 4.1 ↔ 5.3" (солод) / "α 12.5 ↔ 12.7%" (хмель) — null, когда сравнивать
// нечего (нет техданных хотя бы у одной из сторон) или категория не поддерживает
// сравнение (дрожжи сюда не попадают вовсе — у них замен нет).
const formatComparisonLabel = (
  category: IngredientCategory | null,
  lineValue: number | null,
  candidateValue: number | null
): string | null => {
  if (lineValue == null || candidateValue == null) {
    return null;
  }
  if (category === "fermentable") {
    return `EBC ${roundToOneDecimal(candidateValue)} ↔ ${roundToOneDecimal(lineValue)}`;
  }
  if (category === "hop") {
    return `α ${roundToOneDecimal(candidateValue)}% ↔ ${roundToOneDecimal(lineValue)}%`;
  }
  return null;
};

// Деталка каталога при наличии привязки строки (тот же формат URL, что и
// остальная витрина каталога, см. features/shopping/service.ts), иначе — поиск
// по имени. Показывается только для kind="missing" (см. previewBrewBatchConsumption).
const buildCatalogSearchHref = (
  catalogItemId: string | null,
  customId: string | null,
  displayName: string
): string => {
  if (catalogItemId) {
    return `/catalog/system/${catalogItemId}`;
  }
  if (customId) {
    return `/catalog/custom/${customId}`;
  }
  return `/catalog?q=${encodeURIComponent(displayName)}`;
};

/**
 * Предпросмотр списания (владелец утвердил механику: показывается ПЕРЕД каждым
 * списанием). Строки классифицируются:
 * - "exact" / "exact_short" — на складе есть та же самая позиция (exactKey),
 *   короче требуемого или нет;
 * - "substitute_available" — точной позиции нет, но есть кандидат той же группы
 *   (groupKey, family_compatible) — типичный случай "курский пилс ~ Beerex";
 * - "missing" — ни того, ни другого (дрожжи сюда попадают при отсутствии
 *   штамма: замен у них не бывает вовсе).
 *
 * Тот же масштаб партии и тот же exact-подбор, что и у самого списания
 * (buildBrewBatchConsumeLinePlanEntries общий с consumeBrewBatchInventory) —
 * иначе предпросмотр обещал бы одно, а списание делало бы другое.
 */
export const previewBrewBatchConsumption = async (
  userId: string,
  brewBatchId: string
): Promise<BrewBatchConsumePlan | null> => {
  const batch = await getBrewBatchById(userId, brewBatchId);
  if (!batch) {
    return null;
  }

  const alreadyConsumed = await hasConsumedAllocationsForBatch(userId, brewBatchId);
  const recipeId = batch.recipeId;
  if (!recipeId) {
    // Источник рецепта недоступен (варка без клона, рецепт удалён/скрыт) —
    // авто-списание невозможно в принципе, строить план нечего.
    return { brewBatchId, alreadyConsumed, lines: [], exactCount: 0, substituteOnlyCount: 0, missingCount: 0 };
  }

  const targetBatchVolumeL = readBrewPlanBatchVolumeL(batch.brewPlanSnapshot);
  const efficiencyFactor = readBrewPlanEfficiencyFactor(batch.brewPlanSnapshot);

  const { entries, inventoryItemsById } = await buildBrewBatchConsumeLinePlanEntries(userId, recipeId, {
    targetBatchVolumeL,
    efficiencyFactor
  });

  const lines: BrewBatchConsumePlanLine[] = entries.map((entry) => {
    const displayName = entry.line.ingredientDisplayNameSnapshot ?? "—";
    const category = entry.lineProfile.category ?? null;
    const type = entry.lineProfile.type ?? null;
    const lineTechnicalData = entry.lineProfile.technicalData ?? null;

    const requiredLabel = formatPlanQuantityLabel(
      entry.requiredQuantityNormalized,
      entry.line.amountNormalizedUnit,
      category,
      type,
      lineTechnicalData
    );

    const exact: BrewBatchConsumePlanCandidate | null = entry.exactItem
      ? {
        inventoryItemId: entry.exactItem.id,
        name: entry.exactItem.ingredientDisplayNameSnapshot ?? displayName,
        availableQuantity: entry.exactItem.normalizedQuantity,
        availableLabel: formatPlanQuantityLabel(
          entry.exactItem.normalizedQuantity,
          entry.exactItem.normalizedUnit,
          category,
          type,
          lineTechnicalData
        ),
        isShort: entry.exactRequiredInItemUnit != null
          && entry.exactItem.normalizedQuantity + CONSUME_EPSILON < entry.exactRequiredInItemUnit,
        comparison: null
      }
      : null;

    const substitutes: BrewBatchConsumePlanCandidate[] = entry.substitutes.map((candidate) => {
      const item = inventoryItemsById.get(candidate.itemId);
      return {
        inventoryItemId: candidate.itemId,
        name: item?.ingredientDisplayNameSnapshot ?? item?.source.displayName ?? displayName,
        availableQuantity: candidate.available,
        availableLabel: formatPlanQuantityLabel(
          candidate.available,
          candidate.normalizedUnit ?? entry.line.amountNormalizedUnit,
          category,
          type,
          candidate.technicalData ?? null
        ),
        isShort: candidate.available + CONSUME_EPSILON < entry.requiredQuantityNormalized,
        comparison: formatComparisonLabel(category, entry.lineComparisonValue, candidate.comparisonValue)
      };
    });

    const kind: BrewBatchConsumePlanLine["kind"] = exact
      ? (exact.isShort ? "exact_short" : "exact")
      : (substitutes.length > 0 ? "substitute_available" : "missing");

    return {
      recipeIngredientId: entry.line.id,
      displayName,
      category,
      requiredLabel,
      requiredQuantityNormalized: entry.requiredQuantityNormalized,
      kind,
      // Тот же предикат, что и у самого списания (consumeRecipeInventoryAllocations):
      // короткий exact дрожжей клампится (спишем остаток), у прочих категорий —
      // роняет ВСЮ транзакцию INSUFFICIENT_STOCK. Диалог обязан честно различать
      // эти два случая (см. ConsumeLineRow), иначе "спишем остаток" врало бы для
      // категорий, которые сервер на деле блокирует целиком.
      exactClamps: isPresenceBasedRecipeLine(entry.line),
      exact,
      substitutes,
      catalogSearchHref: kind === "missing"
        ? buildCatalogSearchHref(entry.line.ingredientCatalogItemId, entry.line.userCustomIngredientId, displayName)
        : null
    };
  });

  return {
    brewBatchId,
    alreadyConsumed,
    lines,
    exactCount: lines.filter((line) => line.kind === "exact" || line.kind === "exact_short").length,
    substituteOnlyCount: lines.filter((line) => line.kind === "substitute_available").length,
    missingCount: lines.filter((line) => line.kind === "missing").length
  };
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
 *
 * opts.substitutions (Ф2) — утверждённые ПОЛЬЗОВАТЕЛЕМ в предпросмотре замены
 * (opt-in, галочка снята по умолчанию): позиция другой группы-заменителя вместо
 * точного exactKey строки. Каждая пересчитывается и валидируется здесь заново
 * (см. buildBrewBatchConsumeLinePlanEntries) — подделанный запрос с чужой
 * позицией/не тем groupKey роняет ВСЮ операцию (INVALID_SUBSTITUTION), а не
 * тихо игнорирует замену.
 */
export const consumeBrewBatchInventory = async (
  userId: string,
  brewBatchId: string,
  opts: { substitutions?: BrewBatchConsumeSubstitution[] } = {}
): Promise<BrewBatchInventoryConsumeResult> => {
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

  // План считается ДО транзакции: он же — источник валидации замен (ownership +
  // groupKey уже встроены в buildBrewBatchConsumeLinePlanEntries, см. там) и счётчика
  // "ещё остались строки, которые можно закрыть заменой" (substituteAvailableCount).
  // Гонка с самим списанием не страшна: реальную нехватку всё равно ловит
  // INSUFFICIENT_STOCK внутри транзакции — здесь только легитимность выбора.
  const { entries } = await buildBrewBatchConsumeLinePlanEntries(userId, recipeId, {
    targetBatchVolumeL,
    efficiencyFactor
  });
  const entryByLineId = new Map(entries.map((entry) => [entry.line.id, entry]));

  const requestedSubstitutions = opts.substitutions ?? [];
  let substitutionOverrides: Map<string, string> | undefined;
  if (requestedSubstitutions.length > 0) {
    const overrides = new Map<string, string>();
    for (const substitution of requestedSubstitutions) {
      const entry = entryByLineId.get(substitution.recipeIngredientId);
      const isValidCandidate = entry?.substitutes.some(
        (candidate) => candidate.itemId === substitution.inventoryItemId
      ) ?? false;
      if (!isValidCandidate) {
        throw new Error("INVALID_SUBSTITUTION");
      }
      overrides.set(substitution.recipeIngredientId, substitution.inventoryItemId);
    }
    substitutionOverrides = overrides;
  }

  // Строки, оставшиеся БЕЗ утверждённой замены и без достаточного точного
  // совпадения, но у которых есть кандидаты на замену — подсказка для сообщения
  // после списания ("часть позиций можно закрыть заменами").
  const substituteAvailableCount = entries.filter((entry) => {
    if (substitutionOverrides?.has(entry.line.id)) {
      return false;
    }
    const exactSufficient = entry.exactItem != null
      && entry.exactRequiredInItemUnit != null
      && entry.exactItem.normalizedQuantity + CONSUME_EPSILON >= entry.exactRequiredInItemUnit;
    return !exactSufficient && entry.substitutes.length > 0;
  }).length;

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
      substitutionOverrides,
      client: tx
    });
    await consumeRecipeInventoryAllocations(userId, recipeId, {
      brewBatchId,
      targetBatchVolumeL,
      efficiencyFactor,
      client: tx
    });
  });

  const view = await buildView(userId, brewBatchId, recipeId);
  return { ...view, substituteAvailableCount };
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
