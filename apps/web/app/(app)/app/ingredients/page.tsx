import React from "react";
import { GroupedInventoryList } from "@/components/inventory/grouped-inventory-list";
import { InventoryEmptyState } from "@/components/inventory/inventory-empty-state";
import { AddIngredientTrigger } from "@/components/inventory/add-ingredient-trigger";
import { InventoryToolbar } from "@/components/inventory/inventory-toolbar";
import {
  defaultInventorySortOption,
  hasActiveInventoryFilters
} from "@/features/inventory/page-model";
import { getInventorySummaries, listInventoryForUser } from "@/features/inventory/service";
import {
  ingredientCategories,
  ingredientTypes,
  type IngredientSubtype,
  type IngredientCategory,
  type IngredientType
} from "@/features/ingredients/contracts";
import {
  inventorySortOptions,
  type InventorySortOption
} from "@/features/inventory/contracts";
import { resolveIngredientCategory } from "@/features/ingredients/taxonomy";
import { getIngredientSuggestionByRef } from "@/features/ingredients/catalog-service";
import { listSystemCurrencyRates } from "@/features/system/currency-rates";
import { requireUser } from "@/lib/auth";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const parseType = (value: string | undefined): IngredientType | undefined => {
  if (!value || value === "all") {
    return undefined;
  }

  return ingredientTypes.includes(value as IngredientType) ? value as IngredientType : undefined;
};

const parseCategory = (
  categoryValue: string | undefined,
  legacyTypeValue: string | undefined
): IngredientCategory | undefined => {
  if (categoryValue && ingredientCategories.includes(categoryValue as IngredientCategory)) {
    return categoryValue as IngredientCategory;
  }

  const legacyType = parseType(legacyTypeValue);
  return legacyType ? resolveIngredientCategory({ type: legacyType }) ?? undefined : undefined;
};

const parseSubtype = (value: string | undefined): Extract<IngredientSubtype, "malt" | "fermentable"> | undefined => (
  value === "malt" || value === "fermentable" ? value : undefined
);

const parseSort = (value: string | undefined): InventorySortOption => (
  inventorySortOptions.includes(value as InventorySortOption)
    ? value as InventorySortOption
    : defaultInventorySortOption
);

export default async function MyIngredientsPage({ searchParams }: Props) {
  const user = await requireUser();
  const resolvedParams = searchParams ? await searchParams : {};
  const rawSearch = String(resolvedParams.search ?? "").trim();
  const category = parseCategory(
    typeof resolvedParams.category === "string" ? resolvedParams.category : undefined,
    typeof resolvedParams.type === "string" ? resolvedParams.type : undefined
  );
  const subtype = parseSubtype(typeof resolvedParams.subtype === "string" ? resolvedParams.subtype : undefined);
  const sort = parseSort(typeof resolvedParams.sort === "string" ? resolvedParams.sort : undefined);
  const addSource = typeof resolvedParams.addSource === "string" ? resolvedParams.addSource : undefined;
  const addId = typeof resolvedParams.addId === "string" ? resolvedParams.addId : undefined;

  const [items, summary, currencyRates, initialSelection] = await Promise.all([
    listInventoryForUser(user.id, {
      category,
      subtype,
      includeEmpty: true,
      stockState: "all",
      sort,
      search: rawSearch
    }),
    getInventorySummaries(user.id),
    listSystemCurrencyRates(),
    addSource === "catalog" || addSource === "custom"
      ? getIngredientSuggestionByRef(user.id, addSource, addId ?? "")
      : Promise.resolve(null)
  ]);

  const hasAnyItems = summary.totalItems > 0;
  const hasFilters = hasActiveInventoryFilters({
    search: rawSearch,
    category: category ?? "all",
    subtype: subtype ?? null,
    sort
  });

  return (
    <main className="space-y-6">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950">Склад моих ингредиентов</h1>
          {hasAnyItems ? (
            <p className="text-sm text-zinc-500">
              {summary.inStockItems} в наличии{summary.emptyItems > 0 ? ` · ${summary.emptyItems} закончились` : ""}
            </p>
          ) : null}
        </div>
        <AddIngredientTrigger
          preferredCurrency={user.preferredCurrency}
          initialSelection={initialSelection}
          openOnMount={Boolean(initialSelection)}
        />
      </section>

      <InventoryToolbar
        search={rawSearch}
        category={category ?? "all"}
        subtype={subtype ?? null}
        sort={sort}
        summary={summary}
      />

      {items.length === 0
        ? (
          <InventoryEmptyState
            hasAnyItems={hasAnyItems}
            hasFilters={hasFilters}
            search={rawSearch}
            category={category}
          />
        )
        : <GroupedInventoryList items={items} preferredCurrency={user.preferredCurrency} currencyRates={currencyRates} />}
    </main>
  );
}
