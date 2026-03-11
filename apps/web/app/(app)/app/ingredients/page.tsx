import React from "react";
import { GroupedInventoryList } from "@/components/inventory/grouped-inventory-list";
import { InventoryEmptyState } from "@/components/inventory/inventory-empty-state";
import { AddIngredientTrigger } from "@/components/inventory/add-ingredient-trigger";
import { InventorySummary } from "@/components/inventory/inventory-summary";
import { getInventorySummaries, listInventoryForUser } from "@/features/inventory/service";
import { requireUser } from "@/lib/auth";

export default async function MyIngredientsPage() {
  const user = await requireUser();

  const [items, summary] = await Promise.all([
    listInventoryForUser(user.id),
    getInventorySummaries(user.id)
  ]);

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
      {items.length === 0 ? <InventoryEmptyState /> : <GroupedInventoryList items={items} />}
    </main>
  );
}
