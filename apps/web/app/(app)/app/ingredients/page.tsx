import React from "react";
import { GroupedInventoryList } from "@/components/inventory/grouped-inventory-list";
import { InventoryEmptyState } from "@/components/inventory/inventory-empty-state";
import { AddIngredientTrigger } from "@/components/inventory/add-ingredient-trigger";
import { InventorySummary } from "@/components/inventory/inventory-summary";
import { InventoryToolbar } from "@/components/inventory/inventory-toolbar";
import { getInventorySummaries, listInventoryForUser } from "@/features/inventory/service";
import { ingredientTypes, type IngredientType } from "@/features/ingredients/contracts";
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

export default async function MyIngredientsPage({ searchParams }: Props) {
  const user = await requireUser();
  const resolvedParams = searchParams ? await searchParams : {};
  const rawSearch = String(resolvedParams.search ?? "").trim();
  const parsedType = parseType(typeof resolvedParams.type === "string" ? resolvedParams.type : undefined);
  const includeArchived = resolvedParams.archived === "true";

  const [items, summary] = await Promise.all([
    listInventoryForUser(user.id, { includeArchived, type: parsedType, search: rawSearch }),
    getInventorySummaries(user.id)
  ]);

  const hasAnyItems = summary.totalItems > 0;
  const hasFilters = Boolean(rawSearch || parsedType || includeArchived);

  return (
    <main className="space-y-4">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Мои ингредиенты</h1>
          <p className="text-sm text-zinc-600">Следите за запасами и структурой ингредиентов перед следующей варкой.</p>
        </div>
        <AddIngredientTrigger />
      </section>

      <InventorySummary summary={summary} />
      <InventoryToolbar
        search={rawSearch}
        type={parsedType ?? "all"}
        archived={includeArchived}
      />
      {items.length === 0
        ? <InventoryEmptyState hasAnyItems={hasAnyItems} hasFilters={hasFilters} search={rawSearch} type={parsedType} archived={includeArchived} />
        : <GroupedInventoryList items={items} />}
    </main>
  );
}
