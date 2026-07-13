import { roundTo } from "@nb/brewing-core";

import { listBrewBatchesForUser } from "../brew-batches/service";
import { computeRecipeMatchesForBrewBatches, computeRecipeMatchesForUser } from "../recipes/match-service";
import { listOwnRecipeRefs, listSavedRecipes, type OwnRecipeRefsResult } from "../recipes/service";
import { resolveShoppingOpportunityTier } from "../recipes/brewability-badge";
import type { RecipeMatchDto, RecipeMatchLineDto, PublicRecipeListItem } from "../recipes/contracts";
import { buildIngredientCatalogActionHref } from "../ingredients/catalog-links";
import type { IngredientCategory } from "../ingredients/contracts";
import { formatInventoryQuantityInputValue } from "../inventory/display";
import { inventoryCategoryLabels, inventoryCategoryOrder } from "../inventory/page-model";
import { formatInventoryUnitLabel, type InventoryUnit } from "../inventory/units";
import type {
  ShoppingListDto,
  ShoppingListGroupDto,
  ShoppingListLineDto,
  ShoppingListSourceBrew,
  ShoppingOpportunityDto,
  ShoppingOpportunityLineDto
} from "./contracts";

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
const resolveIngredientHrefs = (
  catalogId: string | null,
  customId: string | null,
  quantity: number | null,
  unit: InventoryUnit | null
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
  return { catalogHref: null, addToStockHref: null };
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

type AggregatedLine = {
  ingredientDisplayName: string;
  category: IngredientCategory | null;
  quantityToBuy: number;
  unit: InventoryUnit;
  catalogId: string | null;
  customId: string | null;
  neededBy: { recipeTitle: string; brewName: string }[];
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

/**
 * «Чего не хватает»: две независимые секции на одном батч-матче по складу.
 *
 * §3.2 «Добавить на склад» — агрегирует недостающие ингредиенты по всем ЗАПЛАНИРОВАННЫМ
 * варкам пользователя (status "planned" + привязанный рецепт). Именно
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

  // FIX-5: варки — всегда обязательный запрос; листинги для §3.3 — только
  // когда включена секция «Почти хватает на:». Один Promise.all вместо
  // последовательных ожиданий.
  const [allBatches, savedRecipes, ownRefsResult] = await Promise.all([
    listBrewBatchesForUser(userId),
    includeOpportunities ? listSavedRecipes(userId) : Promise.resolve([] as PublicRecipeListItem[]),
    includeOpportunities
      ? listOwnRecipeRefs(userId)
      : Promise.resolve({ refs: [], familyIdByVersionId: new Map<string, string>() } as OwnRecipeRefsResult)
  ]);
  const { refs: ownRefs, familyIdByVersionId } = ownRefsResult;

  const plannedBatches = allBatches.filter(
    (batch): batch is typeof batch & { recipeId: string } =>
      batch.status === "planned" && Boolean(batch.recipeId)
  );
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

  // Два матча, а не один: §3.2 считает нехватку ПО ПАРТИЯМ (ключ brewBatchId),
  // потому что уже списанное под варку не должно всплывать в её же списке
  // покупок, — а §3.3 матчит рецепты-кандидаты по фактическому складу (ключ
  // recipeId), там понятия партии нет.
  //
  // includeEmptyInventory: иначе полностью пустой склад молча выключил бы весь
  // список (короткий выход в computeRecipeMatchesForUser расcчитан на обратный
  // матчинг «склад → рецепты», где это верно, но не здесь).
  const [matchByBatch, matchByRecipe] = await Promise.all([
    plannedBatches.length > 0
      ? computeRecipeMatchesForBrewBatches({
          userId,
          batches: plannedBatches.map((batch) => ({ brewBatchId: batch.id, recipeId: batch.recipeId }))
        })
      : Promise.resolve({} as Record<string, RecipeMatchDto>),
    opportunityRecipeIds.length > 0
      ? computeRecipeMatchesForUser({ userId, recipeIds: opportunityRecipeIds, includeEmptyInventory: true })
      : Promise.resolve({} as Record<string, RecipeMatchDto>)
  ]);

  // --- §3.2: агрегированная секция по запланированным варкам ---------------

  const aggregated = new Map<string, AggregatedLine>();
  // Ключи строк, которые затронула каждая варка — для missingCount чипа §3.1.
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
      const brewRef = { recipeTitle: batch.recipeTitle, brewName: batch.name };

      const existing = aggregated.get(key);
      if (existing) {
        existing.quantityToBuy = roundTo(existing.quantityToBuy + line.suggestedAddQuantity, 3);
        const alreadyListed = existing.neededBy.some(
          (need) => need.brewName === brewRef.brewName && need.recipeTitle === brewRef.recipeTitle
        );
        if (!alreadyListed) {
          existing.neededBy.push(brewRef);
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
        neededBy: [brewRef]
      });
    }
  }

  // Fix §1.1: hrefs (и label) собираются здесь, ПОСЛЕ полной агрегации — из
  // итогового quantityToBuy. Раньше addToStockHref строился один раз при
  // создании строки (на нехватке только первой варки) и не пересобирался при
  // досуммировании второй — количество в ссылке расходилось с quantityLabel.
  const finalLines: ShoppingListLineDto[] = [...aggregated.entries()].map(([key, agg]) => {
    const { catalogHref, addToStockHref } = resolveIngredientHrefs(agg.catalogId, agg.customId, agg.quantityToBuy, agg.unit);
    return {
      key,
      ingredientDisplayName: agg.ingredientDisplayName,
      category: agg.category,
      quantityToBuy: agg.quantityToBuy,
      unit: agg.unit,
      quantityLabel: formatQuantityLabel(agg.quantityToBuy, agg.unit),
      catalogHref,
      addToStockHref,
      neededBy: agg.neededBy
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
          const { catalogHref, addToStockHref } = resolveIngredientHrefs(
            line.ingredientCatalogItemId,
            line.userCustomIngredientId,
            quantityToBuy,
            unit
          );
          return {
            ingredientDisplayName: line.ingredientDisplayName?.trim() || "Ингредиент",
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

  let emptyReason: ShoppingListDto["emptyReason"] = null;
  if (plannedBatches.length === 0 && opportunities.length === 0) {
    emptyReason = "nothing_to_do";
  } else if (plannedBatches.length > 0 && finalLines.length === 0) {
    emptyReason = "all_in_stock";
  }

  return {
    groups,
    totalItems: finalLines.length,
    plannedBrews,
    opportunities,
    collapsedOpportunityCount,
    emptyReason
  };
};
