import { roundTo } from "@nb/brewing-core";
import { assertRateLimit } from "@nb/auth";
import { db } from "@nb/db";

import { listBrewBatchesForUser } from "../brew-batches/service";
import { computeRecipeMatchesForBrewBatches, computeRecipeMatchesForUser } from "../recipes/match-service";
import { listOwnRecipeRefs, listSavedRecipes, type OwnRecipeRefsResult } from "../recipes/service";
import { resolveShoppingOpportunityTier } from "../recipes/brewability-badge";
import type { RecipeMatchDto, RecipeMatchLineDto, PublicRecipeListItem } from "../recipes/contracts";
import { buildIngredientCatalogActionHref, buildIngredientNameActionHref } from "../ingredients/catalog-links";
import type { IngredientCategory } from "../ingredients/contracts";
import {
  addCatalogIngredientToInventory,
  addCustomIngredientToInventory,
  assertInventoryItemCreationAllowed
} from "../inventory/service";
import { formatInventoryQuantityInputValue } from "../inventory/display";
import { inventoryCategoryLabels, inventoryCategoryOrder } from "../inventory/page-model";
import { formatInventoryUnitLabel, parseInventoryUnit, type InventoryUnit } from "../inventory/units";
import {
  countLineChecks,
  countManualItems,
  deleteLineCheckStrict,
  deleteManualItemRow,
  ensureCatalogRefValid,
  ensureCustomRefOwned,
  insertManualItem,
  loadActiveCatalogIds,
  loadIngredientMetaByCatalogIds,
  loadLineChecks,
  loadManualItems,
  loadPackVariantsByCatalogIds,
  pruneOrphanLineChecks,
  setLineChecked,
  setManualItemCheckedAt,
  updateManualItemRow,
  type ManualItemRow
} from "./data";
import { resolvePackSuggestion, type PackVariantInput } from "./pack-rounding";
import {
  addManualShoppingItemSchema,
  SHOPPING_LINE_CHECK_MAX_COUNT_PER_USER,
  SHOPPING_LINE_CHECK_RATE_LIMIT,
  SHOPPING_LINE_CHECK_RATE_WINDOW_SECONDS,
  SHOPPING_MANUAL_ITEM_CREATE_RATE_LIMIT,
  SHOPPING_MANUAL_ITEM_CREATE_RATE_WINDOW_SECONDS,
  SHOPPING_MANUAL_ITEM_MAX_COUNT_PER_USER,
  updateManualShoppingItemSchema,
  type ShoppingListDto,
  type ShoppingListGroupDto,
  type ShoppingListLineDto,
  type ShoppingListSourceBrew,
  type ShoppingManualItemDto,
  type ShoppingOpportunityDto,
  type ShoppingOpportunityLineDto,
  type TransferLineInput
} from "./contracts";
import { INVENTORY_ITEM_CREATE_RATE_LIMIT } from "../inventory/contracts";

// Развёрнутый ярус секции «Почти хватает на:» — не больше 8 рецептов разом
// (§3.3): остальное уходит в свёрнутый список «Ещё K рецептов», не рендерим
// простыню на 20 разборов.
const OPPORTUNITY_EXPANDED_CAP = 8;

const formatQuantityLabel = (quantityToBuy: number, unit: InventoryUnit) =>
  `${formatInventoryQuantityInputValue(quantityToBuy, unit)} ${formatInventoryUnitLabel(unit, quantityToBuy)}`;

// Ссылки «где посмотреть» / «на склад» под одну нехватку — общие для
// агрегированной секции (§3.2) и возможностей (§3.3), чтобы поведение не
// расходилось между ними. quantity/unit — nullable (FIX-1): у строки §3.3 без
// suggestedAddQuantity/Unit амаунта нет, addToStockHref в этом случае просто
// собирается без addQty/addUnit (buildIngredientCatalogActionHref это умеет).
//
// П3: у строки без каталожной/кастомной привязки (живёт только именем из
// снапшота — типично для импортированных рецептов) раньше оба href были null
// и UI показывал тупик без действий. Фолбэк: catalogHref ведёт в поиск по
// каталогу (`/catalog?q=`), addToStockHref — деeplink «Добавить свой» с
// предзаполненным именем/количеством/категорией (buildIngredientNameActionHref).
const resolveIngredientHrefs = (
  catalogId: string | null,
  customId: string | null,
  quantity: number | null,
  unit: InventoryUnit | null,
  displayName: string,
  category: IngredientCategory | null
): { catalogHref: string | null; addToStockHref: string | null } => {
  const amount = quantity != null && unit != null ? { quantity, unit } : null;
  if (catalogId) {
    return {
      catalogHref: `/catalog/system/${catalogId}`,
      addToStockHref: buildIngredientCatalogActionHref("/app/ingredients", "catalog", catalogId, amount)
    };
  }
  if (customId) {
    return {
      catalogHref: `/catalog/custom/${customId}`,
      addToStockHref: buildIngredientCatalogActionHref("/app/ingredients", "custom", customId, amount)
    };
  }
  return {
    catalogHref: `/catalog?q=${encodeURIComponent(displayName)}`,
    addToStockHref: buildIngredientNameActionHref("/app/ingredients", displayName, amount, category)
  };
};

/**
 * П1: строка БД → DTO ручной позиции. quantity/unit хранятся в БД как
 * пара-или-ничего (CHECK), но unit — сырой varchar: если значение не входит
 * в inventoryUnits (ручная правка в БД, устаревший алиас) — трактуем всю пару
 * как отсутствующую, а не роняем сборку списка целиком.
 */
const mapManualItemToDto = (row: ManualItemRow): ShoppingManualItemDto => {
  const category = (row.category as IngredientCategory | null) ?? null;
  const parsedUnit = row.unit ? parseInventoryUnit(row.unit) : null;
  const hasValidPair = row.quantity != null && parsedUnit != null;
  const quantity = hasValidPair ? row.quantity : null;
  const unit = hasValidPair ? parsedUnit : null;

  const { catalogHref, addToStockHref } = resolveIngredientHrefs(
    row.ingredientCatalogItemId,
    row.userCustomIngredientId,
    quantity,
    unit,
    row.name,
    category
  );

  return {
    id: row.id,
    name: row.name,
    quantity,
    unit,
    quantityLabel: quantity != null && unit != null ? formatQuantityLabel(quantity, unit) : null,
    category,
    catalogHref,
    addToStockHref,
    checked: row.checkedAt != null,
    hasStockLinkage: row.ingredientCatalogItemId != null || row.userCustomIngredientId != null
  };
};

// Ключ дедупликации строки §3.2: по каталожной/кастомной привязке, иначе по
// имени (строки без привязки, доживающие только в снапшоте). Единица — часть
// ключа: один ингредиент в разных единицах не сливаем.
const resolveLineKey = (
  line: Pick<RecipeMatchLineDto, "ingredientCatalogItemId" | "userCustomIngredientId" | "ingredientDisplayName">,
  unit: InventoryUnit
): string => {
  const refKey = line.ingredientCatalogItemId
    ? `catalog:${line.ingredientCatalogItemId}`
    : line.userCustomIngredientId
      ? `custom:${line.userCustomIngredientId}`
      : `name:${(line.ingredientDisplayName ?? "").trim().toLowerCase()}`;
  return `${refKey}|${unit}`;
};

/**
 * Строка матча — реальная нехватка с валидным предложением «докупить».
 * Общий фильтр для §3.2 и §3.3, а также для строки нехваток в акте
 * «Подготовка» (S3, `brew-batches/[id]/page.tsx`) — чтобы число там совпадало
 * с тем, что реально даёт строки в список покупок.
 */
export const isShoppingGapLine = (
  line: RecipeMatchLineDto
): line is RecipeMatchLineDto & { suggestedAddQuantity: number; suggestedAddUnit: InventoryUnit } =>
  (line.status === "missing" || line.status === "partial") &&
  line.suggestedAddQuantity != null &&
  line.suggestedAddUnit != null;

// v4: per-brew запись neededBy несёт СВОЙ остаток quantity (сумма нехваток
// ЭТОЙ варки по данному ключу строки) — отдельно от общего agg.quantityToBuy,
// который суммирует все варки разом. Единица — та же, что у agg.unit (ключ
// строки уже включает unit, разные единицы никогда не сливаются).
type AggregatedNeededBy = { brewBatchId: string; recipeTitle: string; brewName: string; quantity: number };

type AggregatedLine = {
  ingredientDisplayName: string;
  category: IngredientCategory | null;
  quantityToBuy: number;
  unit: InventoryUnit;
  catalogId: string | null;
  customId: string | null;
  neededBy: AggregatedNeededBy[];
};

// Кандидат в «Почти хватает на:» до батч-матча: ссылка + презентация карточки
// (S4) — общая форма для избранного (из PublicRecipeListItem) и своего
// (из OwnRecipeRefDto), чтобы дальше собирать ShoppingOpportunityDto одинаково.
type OpportunityCandidateRef = {
  slug: string;
  title: string;
  styleCode: string | null;
  styleName: string | null;
  styleHref: string | null;
  heroImage: { thumbUrl: string; blurDataUrl: string | null } | null;
  styleImageUrl: string | null;
  colorSrm: number | null;
};

type PlannedBrewBatch = Awaited<ReturnType<typeof listBrewBatchesForUser>>[number] & { recipeId: string };

type AggregatedShoppingLinesResult = {
  aggregated: Map<string, AggregatedLine>;
  // Ключи строк, которые затронула каждая варка — для missingCount чипа §3.1.
  keysByBrew: Map<string, Set<string>>;
  plannedBatches: PlannedBrewBatch[];
};

/**
 * §3.2-агрегация: недостающие ингредиенты по всем ЗАПЛАНИРОВАННЫМ варкам
 * пользователя (status "planned" + привязанный рецепт), слитые в один Map по
 * ключу строки (resolveLineKey) — количество суммируется по всем варкам.
 *
 * Вынесено отдельной функцией из buildShoppingListForUser, потому что тот же
 * расчёт нужен и переносу купленного на склад (transferCheckedToStock, П2):
 * сервер не доверяет клиентской привязке derived-строки (lineKey непрозрачен,
 * не парсится) и пересобирает список ТОЙ ЖЕ логикой, а не тем, что прислал
 * клиент — иначе подменённый lineKey мог бы перенести на склад что угодно.
 */
const computeAggregatedShoppingLines = async (userId: string): Promise<AggregatedShoppingLinesResult> => {
  const allBatches = await listBrewBatchesForUser(userId);
  const plannedBatches = allBatches.filter(
    (batch): batch is PlannedBrewBatch =>
      batch.status === "planned" && Boolean(batch.recipeId)
  );

  const matchByBatch = plannedBatches.length > 0
    ? await computeRecipeMatchesForBrewBatches({
        userId,
        batches: plannedBatches.map((batch) => ({ brewBatchId: batch.id, recipeId: batch.recipeId }))
      })
    : ({} as Record<string, RecipeMatchDto>);

  const aggregated = new Map<string, AggregatedLine>();
  const keysByBrew = new Map<string, Set<string>>();

  for (const batch of plannedBatches) {
    const match = matchByBatch[batch.id];
    if (!match) {
      continue;
    }

    const brewKeys = keysByBrew.get(batch.id) ?? new Set<string>();
    keysByBrew.set(batch.id, brewKeys);

    for (const line of match.lines) {
      if (!isShoppingGapLine(line)) {
        continue;
      }

      const key = resolveLineKey(line, line.suggestedAddUnit);
      brewKeys.add(key);

      const existing = aggregated.get(key);
      if (existing) {
        existing.quantityToBuy = roundTo(existing.quantityToBuy + line.suggestedAddQuantity, 3);
        // v4: если тот же ключ встретился дважды В ОДНОЙ И ТОЙ ЖЕ варке (два
        // лота одного ингредиента в рецепте) — прибавляем к её per-brew
        // остатку, а не заводим вторую запись neededBy на ту же варку.
        const existingNeed = existing.neededBy.find((need) => need.brewBatchId === batch.id);
        if (existingNeed) {
          existingNeed.quantity = roundTo(existingNeed.quantity + line.suggestedAddQuantity, 3);
        } else {
          existing.neededBy.push({
            brewBatchId: batch.id,
            recipeTitle: batch.recipeTitle,
            brewName: batch.name,
            quantity: roundTo(line.suggestedAddQuantity, 3)
          });
        }
        continue;
      }

      aggregated.set(key, {
        ingredientDisplayName: line.ingredientDisplayName?.trim() || "Ингредиент",
        category: line.category,
        quantityToBuy: roundTo(line.suggestedAddQuantity, 3),
        unit: line.suggestedAddUnit,
        catalogId: line.ingredientCatalogItemId,
        customId: line.userCustomIngredientId,
        neededBy: [{
          brewBatchId: batch.id,
          recipeTitle: batch.recipeTitle,
          brewName: batch.name,
          quantity: roundTo(line.suggestedAddQuantity, 3)
        }]
      });
    }
  }

  return { aggregated, keysByBrew, plannedBatches };
};

/**
 * «Чего не хватает»: две независимые секции на одном батч-матче по складу.
 *
 * §3.2 «Добавить на склад» — см. computeAggregatedShoppingLines выше. Именно
 * запланированные варки — честный источник для суммирования: их все
 * собираются сварить, поэтому нехватки складываются. Один и тот же ингредиент
 * из разных варок сливается в одну строку, количество — сумма нехваток.
 *
 * §3.3 «Почти хватает на:» — избранные и свои рецепты (без агрегации между
 * ними, principle §2: «возможность», не обязательство), за вычетом рецептов,
 * уже стоящих за запланированной варкой (иначе дубль с §3.2).
 *
 * Склад грузится один раз на всю страницу через computeRecipeMatchesForUser
 * (§1.5) — раньше на каждый рецепт был свой полный проход по инвентарю.
 *
 * `includeOpportunities` (FIX-2, default false): §3.3 требует ещё два листинга
 * рецептов (избранные + свои) сверх обязательного батч-варочного пути — на
 * дашборде эта секция не рендерится, поэтому дашборд эти листинги не должен
 * даже запрашивать. true — только там, где §3.3 реально показывается (страница
 * /app/shopping).
 */
export const buildShoppingListForUser = async (
  userId: string,
  options?: { includeOpportunities?: boolean }
): Promise<ShoppingListDto> => {
  const includeOpportunities = options?.includeOpportunities ?? false;

  // Листинги для §3.3 — только когда включена секция «Почти хватает на:».
  // П1: ручные позиции читаются ВСЕГДА (в т.ч. для дашборда) — один дешёвый
  // запрос по индексу userId, не завязан на includeOpportunities. П2:
  // отметки «куплено» — тоже всегда (нужны и дашборду для checkedCount).
  const [aggregationResult, savedRecipes, ownRefsResult, manualItemRows, checkedKeys] = await Promise.all([
    computeAggregatedShoppingLines(userId),
    includeOpportunities ? listSavedRecipes(userId) : Promise.resolve([] as PublicRecipeListItem[]),
    includeOpportunities
      ? listOwnRecipeRefs(userId)
      : Promise.resolve({ refs: [], familyIdByVersionId: new Map<string, string>() } as OwnRecipeRefsResult),
    loadManualItems(userId),
    loadLineChecks(userId)
  ]);
  const { aggregated, keysByBrew, plannedBatches } = aggregationResult;
  const { refs: ownRefs, familyIdByVersionId } = ownRefsResult;
  const manualItems: ShoppingManualItemDto[] = manualItemRows.map(mapManualItemToDto);
  const uncheckedManualItemCount = manualItems.filter((item) => !item.checked).length;
  const checkedManualItemCount = manualItems.filter((item) => item.checked).length;

  // П2: ленивая чистка осиротевших отметок — ключ, не нашедший строку в
  // ТЕКУЩЕЙ агрегации, никогда её не найдёт снова (партию отменили/списали/
  // оприходовали) и иначе мусорится в таблице бесконечно. Синхронный await —
  // fire-and-forget умирает в serverless до завершения записи. Чистка идёт до
  // маппинга строк ниже, но на checked текущих строк не влияет: они по
  // определению живые (их ключ входит в aggregated.keys()).
  if (checkedKeys.size > 0) {
    await pruneOrphanLineChecks(userId, [...aggregated.keys()]);
  }

  const plannedRecipeIds = new Set(plannedBatches.map((batch) => batch.recipeId));

  // FIX-4(а): исключаем из §3.3 не только точный recipeId запланированной
  // варки, но ВСЁ семейство — иначе последняя версия того же семейства (если
  // варка стоит за более старой версией) попадает в §3.3 как «свой» кандидат и
  // дублирует сущность, уже показанную в §3.2.
  const plannedFamilyIds = new Set(
    [...plannedRecipeIds]
      .map((recipeId) => familyIdByVersionId.get(recipeId))
      .filter((familyId): familyId is string => Boolean(familyId))
  );
  const isBehindPlannedBrew = (recipeId: string): boolean => {
    if (plannedRecipeIds.has(recipeId)) {
      return true;
    }
    const familyId = familyIdByVersionId.get(recipeId);
    return familyId != null && plannedFamilyIds.has(familyId);
  };
  // FIX-4(б): избранная запись, которая на самом деле — ЛЮБАЯ версия своего же
  // семейства (например, старая v1, сохранённая в избранное), не должна
  // дублировать «свою» последнюю версию, которая и так войдёт кандидатом через
  // ownRefs. familyIdByVersionId содержит только версии ТЕКУЩЕГО пользователя,
  // поэтому наличие recipeId в этой карте однозначно значит «это моя версия».
  const isOwnFamilyVersion = (recipeId: string): boolean => familyIdByVersionId.has(recipeId);

  // Кандидаты в «Почти хватает на:»: избранные + свои, минус то, что уже за
  // запланированной варкой (FIX-4а) и минус избранные записи, дублирующие своё
  // же семейство (FIX-4б). Own — приоритетнее при совпадении id (свой рецепт,
  // который сам же и сохранил в избранное — редкий, но возможный случай).
  const ownRecipeIds = new Set(ownRefs.map((ref) => ref.id));

  const candidateRefs = new Map<string, OpportunityCandidateRef>();
  for (const recipe of savedRecipes) {
    if (!isBehindPlannedBrew(recipe.id) && !isOwnFamilyVersion(recipe.id)) {
      candidateRefs.set(recipe.id, {
        slug: recipe.slug,
        title: recipe.name,
        styleCode: recipe.style?.code ?? null,
        styleName: recipe.style?.name ?? null,
        styleHref: recipe.styleHref,
        heroImage: recipe.heroImage,
        styleImageUrl: recipe.styleImageUrl,
        colorSrm: recipe.colorSrm
      });
    }
  }
  for (const ref of ownRefs) {
    if (!isBehindPlannedBrew(ref.id)) {
      candidateRefs.set(ref.id, {
        slug: ref.slug,
        title: ref.title,
        styleCode: ref.styleCode,
        styleName: ref.styleName,
        styleHref: ref.styleHref,
        heroImage: ref.heroImage,
        styleImageUrl: ref.styleImageUrl,
        colorSrm: ref.colorSrm
      });
    }
  }

  const opportunityRecipeIds = [...candidateRefs.keys()];

  // §3.3 матчит рецепты-кандидаты по фактическому складу (ключ recipeId) — §3.2
  // уже посчитан в computeAggregatedShoppingLines выше (ключ brewBatchId,
  // потому что уже списанное под варку не должно всплывать в её же списке
  // покупок). includeEmptyInventory: иначе полностью пустой склад молча
  // выключил бы весь список (короткий выход в computeRecipeMatchesForUser
  // расcчитан на обратный матчинг «склад → рецепты», где это верно, но не здесь).
  const matchByRecipe = opportunityRecipeIds.length > 0
    ? await computeRecipeMatchesForUser({ userId, recipeIds: opportunityRecipeIds, includeEmptyInventory: true })
    : ({} as Record<string, RecipeMatchDto>);

  // --- §3.2: агрегированная секция по запланированным варкам ---------------
  // (aggregated/keysByBrew уже посчитаны выше, в computeAggregatedShoppingLines.)

  // П4: варианты фасовки батчем по всем catalogId строк §3.2 — один запрос,
  // а не N (по одному на строку). §3.3 (opportunities) фасовки сознательно
  // не получает (см. notes/shopping-list-improvements.md, «Интеграция» П4) —
  // дашборд-вызов (includeOpportunities=false) фасовки получает наравне со
  // страницей /app/shopping, отдельного гейта нет.
  const lineCatalogIds = [...new Set(
    [...aggregated.values()]
      .map((agg) => agg.catalogId)
      .filter((catalogId): catalogId is string => catalogId != null)
  )];
  // v4: мета каталога (бренд/страна) — тот же батч-паттерн, что и у вариантов
  // фасовки чуть ниже, по тому же массиву lineCatalogIds, один запрос на
  // страницу вместо N. Нужна и дашборд-вызову (includeOpportunities=false) —
  // отдельного гейта, как у opportunities, здесь нет (см. П4 выше — то же решение).
  const [packVariantRows, ingredientMetaRows] = await Promise.all([
    loadPackVariantsByCatalogIds(lineCatalogIds),
    loadIngredientMetaByCatalogIds(lineCatalogIds)
  ]);
  const packVariantsByCatalogId = new Map<string, PackVariantInput[]>();
  for (const row of packVariantRows) {
    const variant: PackVariantInput = {
      id: row.id,
      stockContentAmount: row.stockContentAmount,
      stockContentUnit: row.stockContentUnit,
      isDefaultForStock: row.isDefaultForStock,
      position: row.position
    };
    const bucket = packVariantsByCatalogId.get(row.ingredientId);
    if (bucket) {
      bucket.push(variant);
    } else {
      packVariantsByCatalogId.set(row.ingredientId, [variant]);
    }
  }
  const ingredientMetaByCatalogId = new Map(ingredientMetaRows.map((row) => [row.id, row]));

  // Fix §1.1: hrefs (и label) собираются здесь, ПОСЛЕ полной агрегации — из
  // итогового quantityToBuy. Раньше addToStockHref строился один раз при
  // создании строки (на нехватке только первой варки) и не пересобирался при
  // досуммировании второй — количество в ссылке расходилось с quantityLabel.
  const finalLines: ShoppingListLineDto[] = [...aggregated.entries()].map(([key, agg]) => {
    const packSuggestion = agg.catalogId
      ? resolvePackSuggestion(
          { quantity: agg.quantityToBuy, unit: agg.unit },
          packVariantsByCatalogId.get(agg.catalogId) ?? []
        )
      : null;

    // П4: при наличии предложения фасовки deeplink «На склад» и карточка
    // каталога предзаполняются фасовочным итогом (totalQuantity/totalUnit),
    // а не расчётной нехваткой — quantityLabel строки ниже НЕ меняется, это
    // разные вещи (исходная нехватка vs то, что реально покупается).
    const hrefQuantity = packSuggestion ? packSuggestion.totalQuantity : agg.quantityToBuy;
    const hrefUnit = packSuggestion ? packSuggestion.totalUnit : agg.unit;

    const { catalogHref, addToStockHref } = resolveIngredientHrefs(
      agg.catalogId,
      agg.customId,
      hrefQuantity,
      hrefUnit,
      agg.ingredientDisplayName,
      agg.category
    );

    // v4: per-brew neededBy — своё округление до фасовки на КАЖДУЮ варку
    // отдельно (не общий packSuggestion строки выше), чтобы чип конкретной
    // варки в лаборатории показывал именно её долю «пачка N г», а не общий итог.
    const neededBy = agg.neededBy.map((need) => {
      const needPackSuggestion = agg.catalogId
        ? resolvePackSuggestion(
            { quantity: need.quantity, unit: agg.unit },
            packVariantsByCatalogId.get(agg.catalogId) ?? []
          )
        : null;
      return {
        brewBatchId: need.brewBatchId,
        recipeTitle: need.recipeTitle,
        brewName: need.brewName,
        quantityToBuy: need.quantity,
        unit: agg.unit,
        quantityLabel: formatQuantityLabel(need.quantity, agg.unit),
        packSuggestion: needPackSuggestion
          ? { label: needPackSuggestion.packLabel, totalQuantity: needPackSuggestion.totalQuantity, totalUnit: needPackSuggestion.totalUnit }
          : null
      };
    });

    const meta = agg.catalogId ? ingredientMetaByCatalogId.get(agg.catalogId) : undefined;
    // brand приоритетнее producer при заполнении обоих (см. contracts.ts).
    const brand = meta ? (meta.brand ?? meta.producer ?? null) : null;
    const countryName = meta ? (meta.countryName ?? null) : null;

    return {
      key,
      ingredientDisplayName: agg.ingredientDisplayName,
      category: agg.category,
      quantityToBuy: agg.quantityToBuy,
      unit: agg.unit,
      quantityLabel: formatQuantityLabel(agg.quantityToBuy, agg.unit),
      catalogHref,
      addToStockHref,
      neededBy,
      // П2: join по ключу с отметками пользователя + флаг привязки (диалог
      // переноса решает, можно ли строку отправить на склад пачкой).
      checked: checkedKeys.has(key),
      hasStockLinkage: agg.catalogId != null || agg.customId != null,
      packSuggestion: packSuggestion
        ? { label: packSuggestion.packLabel, totalQuantity: packSuggestion.totalQuantity, totalUnit: packSuggestion.totalUnit }
        : null,
      brand,
      countryName
    };
  });

  const byCategory = new Map<IngredientCategory, ShoppingListLineDto[]>();
  const uncategorized: ShoppingListLineDto[] = [];
  for (const line of finalLines) {
    if (line.category) {
      const bucket = byCategory.get(line.category);
      if (bucket) {
        bucket.push(line);
      } else {
        byCategory.set(line.category, [line]);
      }
    } else {
      uncategorized.push(line);
    }
  }

  const sortByName = (items: ShoppingListLineDto[]) =>
    items.sort((left, right) => left.ingredientDisplayName.localeCompare(right.ingredientDisplayName, "ru"));

  const groups: ShoppingListGroupDto[] = inventoryCategoryOrder
    .filter((category) => byCategory.has(category))
    .map((category) => ({
      category,
      label: inventoryCategoryLabels[category],
      items: sortByName(byCategory.get(category)!)
    }));

  if (uncategorized.length > 0) {
    groups.push({ category: "other", label: "Прочее", items: sortByName(uncategorized) });
  }

  const plannedBrews: ShoppingListSourceBrew[] = plannedBatches.map((batch) => ({
    brewBatchId: batch.id,
    brewName: batch.name,
    recipeId: batch.recipeId,
    recipeTitle: batch.recipeTitle,
    plannedFor: batch.plannedFor,
    missingCount: keysByBrew.get(batch.id)?.size ?? 0
  }));

  // --- §3.3: «Почти хватает на:» --------------------------------------------

  const opportunityCandidates = [...candidateRefs.entries()]
    .map(([recipeId, ref]) => {
      const match = matchByRecipe[recipeId];
      if (!match) {
        return null;
      }
      const tier = resolveShoppingOpportunityTier(match);
      if (tier === "hidden") {
        return null;
      }

      // FIX-1: строки §3.3 — ТОЛЬКО status==="missing" (весь тип отсутствует),
      // partial-строки здесь принципиально не показываем (см. комментарий у
      // ShoppingOpportunityLineDto в contracts.ts). Это тот же предикат, что
      // считает match.missingCount в summarizeMatch — отсюда инвариант
      // missingCount === lines.length ниже, без ручной сверки.
      const lines: ShoppingOpportunityLineDto[] = match.lines
        .filter((line) => line.status === "missing")
        .map((line) => {
          const quantityToBuy = line.suggestedAddQuantity != null ? roundTo(line.suggestedAddQuantity, 3) : null;
          const unit = line.suggestedAddUnit ?? null;
          const lineDisplayName = line.ingredientDisplayName?.trim() || "Ингредиент";
          const { catalogHref, addToStockHref } = resolveIngredientHrefs(
            line.ingredientCatalogItemId,
            line.userCustomIngredientId,
            quantityToBuy,
            unit,
            lineDisplayName,
            line.category
          );
          return {
            ingredientDisplayName: lineDisplayName,
            quantityToBuy,
            unit,
            quantityLabel: quantityToBuy != null && unit != null ? formatQuantityLabel(quantityToBuy, unit) : null,
            catalogHref,
            addToStockHref
          };
        });

      return {
        recipeId,
        slug: ref.slug,
        title: ref.title,
        recipeHref: ownRecipeIds.has(recipeId) ? `/app/recipes/${recipeId}/edit` : `/recipes/${ref.slug}`,
        missingCount: match.missingCount,
        lines,
        styleCode: ref.styleCode,
        styleName: ref.styleName,
        styleHref: ref.styleHref,
        heroImage: ref.heroImage,
        styleImageUrl: ref.styleImageUrl,
        colorSrm: ref.colorSrm,
        tier
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  // Сортировка §3.3: сначала меньшая нехватка, затем имя — «докупи 1» выше
  // «докупи 2» вне зависимости от яруса.
  opportunityCandidates.sort(
    (left, right) => left.missingCount - right.missingCount || left.title.localeCompare(right.title, "ru")
  );

  const opportunities: ShoppingOpportunityDto[] = opportunityCandidates.map((entry, index) => ({
    recipeId: entry.recipeId,
    slug: entry.slug,
    title: entry.title,
    recipeHref: entry.recipeHref,
    missingCount: entry.missingCount,
    lines: entry.lines,
    styleCode: entry.styleCode,
    styleName: entry.styleName,
    styleHref: entry.styleHref,
    heroImage: entry.heroImage,
    styleImageUrl: entry.styleImageUrl,
    colorSrm: entry.colorSrm,
    // Ярус "collapsed" (нехватка ≥3) всегда сворачиваем; ярус "expanded" —
    // тоже, если рецепт не влез в кап развёрнутого яруса (см. OPPORTUNITY_EXPANDED_CAP).
    collapsed: entry.tier === "collapsed" || index >= OPPORTUNITY_EXPANDED_CAP
  }));

  const collapsedOpportunityCount = opportunities.filter((entry) => entry.collapsed).length;

  // --- пустые состояния (§3.4) -----------------------------------------------

  // П1: хоть одна ручная позиция (отмеченная или нет — блок «Своё» всё равно
  // рендерится) снимает "nothing_to_do", даже без запланированных варок и
  // возможностей. "all_in_stock" не меняется — ручные позиции сосуществуют
  // с success-строкой (см. shopping-list-view.tsx).
  let emptyReason: ShoppingListDto["emptyReason"] = null;
  if (plannedBatches.length === 0 && opportunities.length === 0 && manualItems.length === 0) {
    emptyReason = "nothing_to_do";
  } else if (plannedBatches.length > 0 && finalLines.length === 0) {
    emptyReason = "all_in_stock";
  }

  const checkedDerivedCount = finalLines.filter((line) => line.checked).length;

  return {
    groups,
    // П2: производные строки + ручные позиции считаются только НЕотмеченными —
    // «сколько ещё купить» (было: П1 — только неотмеченные ручные; теперь то же
    // правило распространяется и на производные строки §3.2).
    totalItems: (finalLines.length - checkedDerivedCount) + uncheckedManualItemCount,
    // П2: сколько отмечено «куплено» всего — управляет видимостью кнопки
    // «Пополнить склад (K)».
    checkedCount: checkedDerivedCount + checkedManualItemCount,
    plannedBrews,
    opportunities,
    collapsedOpportunityCount,
    manualItems,
    emptyReason
  };
};

// --- П1: мутации ручных позиций ---------------------------------------------

/**
 * Анти-абьюз-барьер для добавления ручной позиции: rate limit + щедрая квота
 * на пользователя — тот же паттерн, что и у assertInventoryItemCreationAllowed
 * / assertCustomIngredientCreationAllowed (features/inventory/service.ts).
 * Бросает RATE_LIMITED / SHOPPING_MANUAL_ITEM_QUOTA_REACHED.
 */
const assertManualItemCreationAllowed = async (userId: string): Promise<void> => {
  await assertRateLimit(
    userId,
    "shopping_manual_item_add",
    SHOPPING_MANUAL_ITEM_CREATE_RATE_LIMIT,
    SHOPPING_MANUAL_ITEM_CREATE_RATE_WINDOW_SECONDS
  );

  const existingCount = await countManualItems(userId);
  if (existingCount >= SHOPPING_MANUAL_ITEM_MAX_COUNT_PER_USER) {
    throw new Error("SHOPPING_MANUAL_ITEM_QUOTA_REACHED");
  }
};

export const addManualShoppingItem = async (userId: string, input: unknown): Promise<ShoppingManualItemDto> => {
  await assertManualItemCreationAllowed(userId);
  const parsed = addManualShoppingItemSchema.parse(input);

  // Привязка приходит напрямую от клиента (не через серверную агрегацию, как
  // у derived-строк §3.2) — сервер обязан сам проверить её валидность, иначе
  // в БД попадёт ссылка на несуществующий/деактивированный/чужой ингредиент.
  if (parsed.catalogId != null) {
    await ensureCatalogRefValid(parsed.catalogId);
  }
  if (parsed.customId != null) {
    await ensureCustomRefOwned(userId, parsed.customId);
  }

  const created = await insertManualItem(userId, {
    name: parsed.name,
    quantity: parsed.quantity ?? null,
    unit: parsed.unit ?? null,
    category: parsed.category ?? null,
    ingredientCatalogItemId: parsed.catalogId ?? null,
    userCustomIngredientId: parsed.customId ?? null
  });

  return mapManualItemToDto(created);
};

export const updateManualShoppingItem = async (
  userId: string,
  id: string,
  input: unknown
): Promise<ShoppingManualItemDto> => {
  const parsed = updateManualShoppingItemSchema.parse(input);

  const updated = await updateManualItemRow(userId, id, {
    name: parsed.name,
    quantity: parsed.quantity ?? null,
    unit: parsed.unit ?? null
  });

  return mapManualItemToDto(updated);
};

export const deleteManualShoppingItem = async (userId: string, id: string): Promise<void> => {
  await deleteManualItemRow(userId, id);
};

export const toggleManualShoppingItem = async (
  userId: string,
  id: string,
  checked: boolean
): Promise<ShoppingManualItemDto> => {
  const updated = await setManualItemCheckedAt(userId, id, checked);
  return mapManualItemToDto(updated);
};

// --- П2: отметка «куплено» на производных строках + перенос на склад --------

/**
 * Анти-абьюз-барьер на ПОСТАНОВКУ отметки «куплено» — только checked=true:
 * снятие (delete) не растит таблицу и не должно блокироваться (иначе можно
 * было бы застрять с «зависшей» отметкой). Лимиты щедрые (см. contracts.ts).
 * Бросает RATE_LIMITED / SHOPPING_LINE_CHECK_QUOTA_REACHED.
 */
const assertLineCheckCreationAllowed = async (userId: string): Promise<void> => {
  await assertRateLimit(
    userId,
    "shopping_line_check",
    SHOPPING_LINE_CHECK_RATE_LIMIT,
    SHOPPING_LINE_CHECK_RATE_WINDOW_SECONDS
  );

  const existingCount = await countLineChecks(userId);
  if (existingCount >= SHOPPING_LINE_CHECK_MAX_COUNT_PER_USER) {
    throw new Error("SHOPPING_LINE_CHECK_QUOTA_REACHED");
  }
};

export const toggleShoppingLineChecked = async (
  userId: string,
  lineKey: string,
  checked: boolean
): Promise<void> => {
  if (checked) {
    await assertLineCheckCreationAllowed(userId);
  }
  await setLineChecked(userId, lineKey, checked);
};

export type TransferShoppingResult = {
  transferredCount: number;
  skippedCount: number;
};

// Строка входа, признанная сервером допустимой к переносу — привязка
// (catalogId/customId) взята из СЕРВЕРНЫХ данных (актуальная агрегация /
// строка БД ручной позиции), а не из того, что прислал клиент.
type AcceptedTransferLine =
  | {
      kind: "derived";
      lineKey: string;
      quantity: number;
      unit: InventoryUnit;
      catalogId: string | null;
      customId: string | null;
    }
  | {
      kind: "manual";
      id: string;
      quantity: number;
      unit: InventoryUnit;
      catalogId: string | null;
      customId: string | null;
    };

/**
 * Перенос отмеченных строк списка покупок на склад (П2). Сервер не доверяет
 * присланной строке: derived-строка несёт только непрозрачный lineKey — его
 * привязка (catalogId/customId) читается из ТЕКУЩЕЙ агрегации
 * (computeAggregatedShoppingLines), пересобранной здесь же, а не из клиента;
 * manual-строка несёт id ручной позиции — привязка читается из её строки БД.
 * Строка, не найденная сервером как «отмечена И имеет привязку» — skipped, а
 * не ошибка целиком (name-only строки честно уходят в хвост «Добавьте вручную»
 * диалога, это штатный путь, не баг).
 *
 * Дополнительные барьеры accept-фазы (устойчивость к абьюзу/гонкам):
 * - Дубль derived-lineKey/manual-id во входе засчитывается один раз, повтор —
 *   в skippedCount (иначе дубль derived создал бы вторую позицию склада, а
 *   дубль manual на второй попытке удалить уже удалённую строку уронил бы всю
 *   транзакцию NOT_FOUND).
 * - Каталожная привязка могла деактивироваться между сборкой списка и
 *   сабмитом переноса — батч-проверка (loadActiveCatalogIds) отсеивает такие
 *   строки в skippedCount ДО транзакции, а не роняет всю пачку одной
 *   невалидной строкой. Кастомные привязки не проверяются — они уже
 *   гарантированы владением в БД (FK + userId на insert).
 * - Пачка больше INVENTORY_ITEM_CREATE_RATE_LIMIT детерминированно провалит
 *   assertInventoryItemCreationAllowed — эта проверка стоит ДО вызова барьера,
 *   чтобы не сжигать rate-limit окно на заведомо обречённый запрос (лимит
 *   инкрементируется даже отклонённым попыткам, см. @nb/auth/assertRateLimit).
 *
 * Барьер (rate limit + квота) прогоняется ОДИН раз на всю принятую пачку, ДО
 * транзакции — так же, как остальные batch-пути создания (см.
 * assertInventoryItemCreationAllowed). Сама вставка позиций склада + удаление
 * перенесённых отметок/ручных позиций — в ОДНОЙ транзакции: либо всё, либо
 * ничего (иначе успевшая вставиться позиция при обрыве на следующей строке
 * осталась бы без удалённой отметки — «куплено» переживёт перенос). Отметка
 * derived-строки удаляется deleteLineCheckStrict — если строку успел снять/
 * перенести параллельный сабмит, транзакция откатывается вместо тихого
 * дубля позиции склада (обычный идемпотентный deleteLineCheck это маскировал
 * бы, засчитывая 0 удалённых строк как успех).
 */
export const transferCheckedToStock = async (
  userId: string,
  lines: TransferLineInput[]
): Promise<TransferShoppingResult> => {
  const [{ aggregated }, checkedKeys, manualItemRows] = await Promise.all([
    computeAggregatedShoppingLines(userId),
    loadLineChecks(userId),
    loadManualItems(userId)
  ]);

  const manualById = new Map(manualItemRows.map((row) => [row.id, row]));

  let accepted: AcceptedTransferLine[] = [];
  let skippedCount = 0;
  // Дедуп входа: повторный derived-lineKey/manual-id → второй экземпляр не
  // должен породить второй accepted (см. докстрою выше).
  const seenInputKeys = new Set<string>();

  for (const line of lines) {
    const dedupeKey = line.kind === "derived" ? `derived:${line.lineKey}` : `manual:${line.id}`;
    if (seenInputKeys.has(dedupeKey)) {
      skippedCount += 1;
      continue;
    }
    seenInputKeys.add(dedupeKey);

    if (line.kind === "derived") {
      const agg = checkedKeys.has(line.lineKey) ? aggregated.get(line.lineKey) : undefined;
      const hasLinkage = agg != null && (agg.catalogId != null || agg.customId != null);
      if (!hasLinkage) {
        skippedCount += 1;
        continue;
      }

      accepted.push({
        kind: "derived",
        lineKey: line.lineKey,
        quantity: line.quantity,
        unit: line.unit,
        catalogId: agg!.catalogId,
        customId: agg!.customId
      });
      continue;
    }

    const row = manualById.get(line.id);
    const hasLinkage = row != null
      && row.checkedAt != null
      && (row.ingredientCatalogItemId != null || row.userCustomIngredientId != null);
    if (!hasLinkage) {
      skippedCount += 1;
      continue;
    }

    accepted.push({
      kind: "manual",
      id: line.id,
      quantity: line.quantity,
      unit: line.unit,
      catalogId: row!.ingredientCatalogItemId,
      customId: row!.userCustomIngredientId
    });
  }

  // Батч-проверка активности каталожных привязок принятых строк — одним
  // select по уникальным catalogId (см. докстрою выше).
  const catalogIdsToVerify = [...new Set(
    accepted.map((line) => line.catalogId).filter((catalogId): catalogId is string => catalogId != null)
  )];
  const activeCatalogIds = await loadActiveCatalogIds(catalogIdsToVerify);
  accepted = accepted.filter((line) => {
    if (line.catalogId != null && !activeCatalogIds.has(line.catalogId)) {
      skippedCount += 1;
      return false;
    }
    return true;
  });

  if (accepted.length === 0) {
    return { transferredCount: 0, skippedCount: lines.length };
  }

  // Падаем ДО assertInventoryItemCreationAllowed — иначе пачка больше лимита
  // детерминированно сжигает rate-limit окно на обречённый запрос (см. докстрою).
  if (accepted.length > INVENTORY_ITEM_CREATE_RATE_LIMIT) {
    throw new Error("TRANSFER_TOO_MANY_LINES");
  }

  // ОДИН раз на всю принятую пачку, ДО транзакции — add-пути ниже вызываются
  // с skipCreationGate: true, чтобы не повторять барьер на каждую строку.
  await assertInventoryItemCreationAllowed(userId, accepted.length);

  await db.transaction(async (tx) => {
    for (const line of accepted) {
      if (line.catalogId) {
        await addCatalogIngredientToInventory(
          userId,
          {
            ingredientCatalogItemId: line.catalogId,
            packageVariantId: null,
            enteredQuantity: line.quantity,
            enteredUnit: line.unit,
            priceInputMode: null,
            priceInputAmountMinor: null,
            priceInputCurrency: null,
            purchasedAt: null,
            freshnessDate: null,
            notes: null,
            waterTreatmentConcentrationPct: null
          },
          { skipCreationGate: true },
          tx
        );
      } else {
        await addCustomIngredientToInventory(
          userId,
          {
            userCustomIngredientId: line.customId,
            enteredQuantity: line.quantity,
            enteredUnit: line.unit,
            priceInputMode: null,
            priceInputAmountMinor: null,
            priceInputCurrency: null,
            purchasedAt: null,
            freshnessDate: null,
            notes: null
          },
          { skipCreationGate: true },
          tx
        );
      }

      if (line.kind === "derived") {
        await deleteLineCheckStrict(userId, line.lineKey, tx);
      } else {
        await deleteManualItemRow(userId, line.id, tx);
      }
    }
  });

  return { transferredCount: accepted.length, skippedCount };
};
