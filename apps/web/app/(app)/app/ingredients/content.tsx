import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GroupedInventoryList } from "@/components/inventory/grouped-inventory-list";
import { InventoryEmptyState } from "@/components/inventory/inventory-empty-state";
import { AddIngredientTrigger } from "@/components/inventory/add-ingredient-trigger";
import { InventoryToolbar } from "@/components/inventory/inventory-toolbar";
import { BrewableRecipesSection } from "@/components/recipes/brewable-recipes-section";
import {
  buildInventoryToolbarHref,
  defaultInventorySortOption,
  hasActiveInventoryFilters,
  resolveInventoryShowFinished
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
import {
  getIngredientSuggestionByRef
} from "@/features/ingredients/catalog-service";
import { listSystemCurrencyRates } from "@/features/system/currency-rates";
import { findBrewableRecipesForUser } from "@/features/recipes/match-service";
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

const parseGroup = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const parseShowFinished = (
  finishedValue: string | undefined,
  legacyStockValue: string | undefined
) => {
  if (finishedValue != null) {
    return finishedValue === "true";
  }

  return legacyStockValue === "all" || legacyStockValue === "empty";
};

const parseSort = (value: string | undefined): InventorySortOption => (
  inventorySortOptions.includes(value as InventorySortOption)
    ? value as InventorySortOption
    : defaultInventorySortOption
);

export async function MyIngredientsContent({ searchParams }: Props = {}) {
  const user = await requireUser();
  const resolvedParams = searchParams ? await searchParams : {};
  const rawSearch = String(resolvedParams.search ?? "").trim();
  const category = parseCategory(
    typeof resolvedParams.category === "string" ? resolvedParams.category : undefined,
    typeof resolvedParams.type === "string" ? resolvedParams.type : undefined
  );
  const parsedSubtype = parseSubtype(typeof resolvedParams.subtype === "string" ? resolvedParams.subtype : undefined)
    ?? (typeof resolvedParams.type === "string" && resolvedParams.type === "malt" ? "malt" : undefined);
  const subtype = parsedSubtype;
  const group = parseGroup(typeof resolvedParams.group === "string" ? resolvedParams.group : undefined);
  const requestedShowFinished = parseShowFinished(
    typeof resolvedParams.finished === "string" ? resolvedParams.finished : undefined,
    typeof resolvedParams.stock === "string" ? resolvedParams.stock : undefined
  );
  const sort = parseSort(typeof resolvedParams.sort === "string" ? resolvedParams.sort : undefined);
  const addSource = typeof resolvedParams.addSource === "string" ? resolvedParams.addSource : undefined;
  const addId = typeof resolvedParams.addId === "string" ? resolvedParams.addId : undefined;
  // Дефицит из списка покупок (UX-находка #20): предзаполнить количество/единицу.
  const addQty = typeof resolvedParams.addQty === "string" ? resolvedParams.addQty : undefined;
  const addUnit = typeof resolvedParams.addUnit === "string" ? resolvedParams.addUnit : undefined;

  const [items, summary, currencyRates, initialSelection] = await Promise.all([
    listInventoryForUser(user.id, {
      category,
      subtype,
      group,
      includeEmpty: requestedShowFinished,
      stockState: requestedShowFinished ? "all" : "in_stock",
      sort,
      search: rawSearch
    }),
    getInventorySummaries(user.id),
    listSystemCurrencyRates(),
    addSource === "catalog" || addSource === "custom"
      ? getIngredientSuggestionByRef(user.id, addSource, addId ?? "")
      : Promise.resolve(null)
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

  const hasAnyItems = summary.totalItems > 0;
  // Суженный вид (поиск/категория/подгруппа) — пользователь ищет конкретную
  // позицию; секция «Можно сварить» про весь склад, поэтому под отфильтрованным
  // списком она только мешает — и заодно не гоняем под неё тяжёлый запрос.
  const isNarrowedView = Boolean(rawSearch) || category != null || subtype != null || Boolean(group);
  // Обратный матчинг «склад → рецепты» считаем только при наличии запасов,
  // чтобы не гонять тяжёлый запрос на пустом складе. Вторичная секция — при сбое
  // деградируем тихо, не роняя страницу склада.
  const brewableRecipes = !isNarrowedView && summary.inStockItems > 0
    ? await findBrewableRecipesForUser({ userId: user.id, limit: 6 }).catch(() => [])
    : [];
  const hasFilters = hasActiveInventoryFilters({
    search: rawSearch,
    category: category ?? "all",
    subtype: subtype ?? null,
    group: group ?? null,
    showFinished,
    sort
  });
  const finishedHref = buildInventoryToolbarHref("/app/ingredients", {
    search: rawSearch,
    category: category ?? "all",
    subtype: subtype ?? null,
    group: group ?? null,
    showFinished: true,
    sort
  });

  const inventoryList = items.length === 0 ? (
    <InventoryEmptyState
      hasAnyItems={hasAnyItems}
      hasFilters={hasFilters}
      search={rawSearch}
      category={category}
      subtype={subtype ?? null}
      group={group ?? null}
      showFinished={showFinished}
    />
  ) : (
    <GroupedInventoryList
      items={items}
      preferredCurrency={user.preferredCurrency}
      currencyRates={currencyRates}
      layout={sort === "price" || sort === "best_before" ? "flat" : "grouped"}
      sortEmphasis={sort === "price" ? "price" : sort === "best_before" ? "best_before" : null}
    />
  );

  // «Можно сварить» — главный мотиватор страницы. На десктопе выносим в правый
  // sticky-rail (виден без скролла, заполняет пустое место рядом с узкими
  // карточками); на мобиле секция стекается под список (+ якорь в шапке). Без
  // подходящих рецептов rail не занимает место — список во всю ширину.
  const inventoryBody = brewableRecipes.length > 0 ? (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="min-w-0">{inventoryList}</div>
      <aside className="lg:sticky lg:top-4">
        <BrewableRecipesSection recipes={brewableRecipes} />
      </aside>
    </div>
  ) : (
    inventoryList
  );

  return (
    <main className="space-y-5">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">Мой склад</h1>
          {hasAnyItems ? (
            <p className="text-sm text-zinc-400">
              {summary.inStockItems} в наличии
              {summary.emptyItems > 0 ? (
                showFinished ? (
                  <> · {summary.emptyItems} закончились</>
                ) : (
                  <>
                    {" · "}
                    <Link
                      href={finishedHref}
                      className="underline decoration-dotted underline-offset-2 transition-colors hover:text-zinc-600"
                    >
                      {summary.emptyItems} закончились
                    </Link>
                  </>
                )
              ) : null}
              {/* На мобиле секция «Можно сварить» уходит в самый низ — даём якорь
                  прямо в шапке. На десктопе она в правом rail, якорь не нужен. */}
              {brewableRecipes.length > 0 ? (
                <>
                  {" · "}
                  <a
                    href="#brewable"
                    className="underline decoration-dotted underline-offset-2 transition-colors hover:text-zinc-600 lg:hidden"
                  >
                    можно сварить: {brewableRecipes.length}
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        <AddIngredientTrigger
          preferredCurrency={user.preferredCurrency}
          initialSelection={initialSelection}
          initialCategory={initialSelection?.category ?? category ?? null}
          initialSubtype={
            initialSelection?.subtype === "malt" || initialSelection?.subtype === "fermentable"
              ? initialSelection.subtype
              : (subtype ?? null)
          }
          initialGroup={group ?? null}
          initialQuantity={initialSelection ? addQty ?? null : null}
          initialUnit={initialSelection ? addUnit ?? null : null}
          openOnMount={Boolean(initialSelection)}
        />
      </section>

      <InventoryToolbar
        search={rawSearch}
        category={category ?? "all"}
        subtype={subtype ?? null}
        group={group ?? null}
        showFinished={showFinished}
        sort={sort}
        summary={summary}
        visibleItemCount={items.length}
      />

      {inventoryBody}
    </main>
  );
}
