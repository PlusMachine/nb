import { roundTo } from "@nb/brewing-core";

import { listBrewBatchesForUser } from "../brew-batches/service";
import { computeRecipeMatch } from "../recipes/match-service";
import { buildIngredientCatalogActionHref } from "../ingredients/catalog-links";
import type { IngredientCategory } from "../ingredients/contracts";
import { formatInventoryQuantityInputValue } from "../inventory/display";
import { inventoryCategoryLabels, inventoryCategoryOrder } from "../inventory/page-model";
import { inventoryUnitShortLabels } from "../inventory/units";
import type {
  ShoppingListDto,
  ShoppingListGroupDto,
  ShoppingListLineDto,
  ShoppingListSourceBrew
} from "./contracts";

const formatQuantityLabel = (line: Pick<ShoppingListLineDto, "quantityToBuy" | "unit">) =>
  `${formatInventoryQuantityInputValue(line.quantityToBuy, line.unit)} ${inventoryUnitShortLabels[line.unit]}`;

/**
 * Список покупок: агрегирует недостающие для варки ингредиенты по всем
 * ЗАПЛАНИРОВАННЫМ варкам пользователя (status "planned" + привязанный рецепт).
 * Именно запланированные варки — честный источник для суммирования: их все
 * собираются сварить, поэтому нехватки складываются. Один и тот же ингредиент
 * из разных варок сливается в одну строку, количество — сумма нехваток.
 */
export const buildShoppingListForUser = async (userId: string): Promise<ShoppingListDto> => {
  const plannedBatches = (await listBrewBatchesForUser(userId)).filter(
    (batch): batch is typeof batch & { recipeId: string } =>
      batch.status === "planned" && Boolean(batch.recipeId)
  );

  if (plannedBatches.length === 0) {
    return { groups: [], totalItems: 0, plannedBrews: [], emptyReason: "no_planned_brews" };
  }

  const plannedBrews: ShoppingListSourceBrew[] = plannedBatches.map((batch) => ({
    brewBatchId: batch.id,
    brewName: batch.name,
    recipeId: batch.recipeId,
    recipeTitle: batch.recipeTitle,
    plannedFor: batch.plannedFor
  }));

  // Один рецепт может стоять за несколькими варками — матчим каждый рецепт один раз.
  const uniqueRecipeIds = [...new Set(plannedBatches.map((batch) => batch.recipeId))];
  const matchEntries = await Promise.all(
    uniqueRecipeIds.map((recipeId) =>
      computeRecipeMatch({ userId, recipeId })
        .then((match) => [recipeId, match] as const)
        .catch(() => [recipeId, null] as const)
    )
  );
  const matchByRecipe = new Map(matchEntries);

  const aggregated = new Map<string, ShoppingListLineDto>();

  for (const batch of plannedBatches) {
    const match = matchByRecipe.get(batch.recipeId);
    if (!match) {
      continue;
    }

    for (const line of match.lines) {
      const isGap = line.status === "missing" || line.status === "partial";
      if (!isGap || line.suggestedAddQuantity == null || line.suggestedAddUnit == null) {
        continue;
      }

      const refKey = line.ingredientCatalogItemId
        ? `catalog:${line.ingredientCatalogItemId}`
        : line.userCustomIngredientId
          ? `custom:${line.userCustomIngredientId}`
          : `name:${(line.ingredientDisplayName ?? "").trim().toLowerCase()}`;
      // Единица входит в ключ: один ингредиент в разных единицах не сливаем.
      const key = `${refKey}|${line.suggestedAddUnit}`;
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

      const catalogId = line.ingredientCatalogItemId;
      const customId = line.userCustomIngredientId;
      aggregated.set(key, {
        key,
        ingredientDisplayName: line.ingredientDisplayName?.trim() || "Ингредиент",
        category: line.category,
        quantityToBuy: roundTo(line.suggestedAddQuantity, 3),
        unit: line.suggestedAddUnit,
        quantityLabel: "",
        catalogHref: catalogId
          ? `/catalog/system/${catalogId}`
          : customId
            ? `/catalog/custom/${customId}`
            : null,
        addToStockHref: catalogId
          ? buildIngredientCatalogActionHref("/app/ingredients", "catalog", catalogId)
          : customId
            ? buildIngredientCatalogActionHref("/app/ingredients", "custom", customId)
            : null,
        neededBy: [brewRef]
      });
    }
  }

  if (aggregated.size === 0) {
    return { groups: [], totalItems: 0, plannedBrews, emptyReason: "all_in_stock" };
  }

  for (const line of aggregated.values()) {
    line.quantityLabel = formatQuantityLabel(line);
  }

  const byCategory = new Map<IngredientCategory, ShoppingListLineDto[]>();
  const uncategorized: ShoppingListLineDto[] = [];
  for (const line of aggregated.values()) {
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

  return { groups, totalItems: aggregated.size, plannedBrews, emptyReason: null };
};
