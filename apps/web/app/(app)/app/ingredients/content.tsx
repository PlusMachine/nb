import React from "react";
import { redirect } from "next/navigation";
import {
  buildInventoryToolbarHref,
  resolveInventoryShowFinished
} from "@/features/inventory/page-model";
import { getInventorySummaries, listInventoryForUserWithMeta } from "@/features/inventory/service";
import { ingredientCategories, type IngredientCategory } from "@/features/ingredients/contracts";
import { InventoryPageClient } from "@/components/inventory/inventory-page-client";
import { inventoryFiltersHref, inventoryServiceQuery, parseInventoryFilters } from "@/features/inventory/query";
import {
  getIngredientSuggestionByRef
} from "@/features/ingredients/catalog-service";
import { listSystemCurrencyRates } from "@/features/system/currency-rates";
import { findBrewableRecipesForUser } from "@/features/recipes/match-service";
import { buildShoppingListForUser } from "@/features/shopping/service";
import { requireUser } from "@/lib/auth";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function MyIngredientsContent({ searchParams }: Props = {}) {
  const user = await requireUser();
  const resolvedParams = searchParams ? await searchParams : {};
  const filters = parseInventoryFilters(resolvedParams);
  const { search: rawSearch, category, subtype, group, showFinished: requestedShowFinished, sort } = filters;
  const addSource = typeof resolvedParams.addSource === "string" ? resolvedParams.addSource : undefined;
  const addId = typeof resolvedParams.addId === "string" ? resolvedParams.addId : undefined;
  // Дефицит из «Чего не хватает» (UX-находка #20): предзаполнить количество/единицу.
  const addQty = typeof resolvedParams.addQty === "string" ? resolvedParams.addQty : undefined;
  const addUnit = typeof resolvedParams.addUnit === "string" ? resolvedParams.addUnit : undefined;
  // Строка-нехватка без каталожной/кастомной привязки (П3): живёт только именем
  // из снапшота, у неё нет addSource/addId — deeplink несёт голое имя (+
  // опционально категорию), открываем модалку сразу в режиме «Добавить свой».
  const rawAddName = typeof resolvedParams.addName === "string" ? resolvedParams.addName.trim() : "";
  const addName = rawAddName.length > 0 ? rawAddName : undefined;
  const rawAddCategory = typeof resolvedParams.addCategory === "string" ? resolvedParams.addCategory : undefined;
  const addCategory = rawAddCategory && ingredientCategories.includes(rawAddCategory as IngredientCategory)
    ? (rawAddCategory as IngredientCategory)
    : undefined;

  const [{ items, searchRescue }, summary, currencyRates, initialSelection, missingCount] = await Promise.all([
    listInventoryForUserWithMeta(user.id, inventoryServiceQuery(filters)),
    getInventorySummaries(user.id),
    listSystemCurrencyRates(),
    addSource === "catalog" || addSource === "custom"
      ? getIngredientSuggestionByRef(user.id, addSource, addId ?? "").then((item) => item?.inventoryEnabled === false ? null : item)
      : Promise.resolve(null),
    // Счётчик для таба «Чего не хватает» (без opportunities — дешёвый путь,
    // как у виджета дашборда). При сбое таб просто остаётся без цифры.
    buildShoppingListForUser(user.id).then((list) => list.totalItems).catch(() => 0)
  ]);
  const showFinished = resolveInventoryShowFinished(requestedShowFinished, summary);

  if (requestedShowFinished && !showFinished) {
    redirect(buildInventoryToolbarHref("/app/ingredients", {
      search: rawSearch,
      category: category ?? "all",
      subtype: subtype ?? null,
      group: group ?? null,
      showFinished: false,
      sort
    }));
  }

  const isNarrowedView = Boolean(rawSearch) || category != null || subtype != null || Boolean(group);
  // Обратный матчинг «склад → рецепты» считаем только при наличии запасов,
  // чтобы не гонять тяжёлый запрос на пустом складе. Вторичная секция — при сбое
  // деградируем тихо, не роняя страницу склада.
  const brewableRecipes = !isNarrowedView && summary.inStockItems > 0
    ? await findBrewableRecipesForUser({ userId: user.id, limit: 6 }).catch(() => [])
    : [];
  return (
    <InventoryPageClient
      initial={{ key: inventoryFiltersHref(filters), filters, items, searchRescue, summary, brewableRecipes }}
      preferredCurrency={user.preferredCurrency}
      currencyRates={currencyRates}
      missingCount={missingCount}
      addIngredientProps={{
        preferredCurrency: user.preferredCurrency,
        initialSelection,
        initialCategory: initialSelection?.category ?? addCategory ?? null,
        initialSubtype: initialSelection?.subtype === "malt" || initialSelection?.subtype === "fermentable" ? initialSelection.subtype : null,
        initialDisplayName: addName ?? null,
        initialQuantity: (initialSelection || addName) ? addQty ?? null : null,
        initialUnit: (initialSelection || addName) ? addUnit ?? null : null,
        openOnMount: resolvedParams.add === "1" || Boolean(initialSelection) || Boolean(addName)
      }}
    />
  );
}
