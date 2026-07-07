import React from "react";

import { InventoryTabs } from "@/components/inventory/inventory-tabs";
import { ShoppingListView } from "@/components/shopping/shopping-list-view";
import { buildShoppingListForUser } from "@/features/shopping/service";
import { requireUser } from "@/lib/auth";

// «Чего не хватает» — таб раздела «Мой склад» (второй таб к «Запасам»),
// поэтому шапка повторяет /app/ingredients: тот же H1 и те же InventoryTabs.
export async function ShoppingListContent() {
  const user = await requireUser();
  // Секция «Почти хватает на:» (§3.3) нужна только на странице раздела —
  // виджет дашборда её не показывает и лишние листинги не запрашивает.
  const list = await buildShoppingListForUser(user.id, { includeOpportunities: true });

  return (
    <main className="space-y-5">
      <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Мой склад</h1>
      <InventoryTabs active="missing" missingCount={list.totalItems} />
      <ShoppingListView list={list} />
    </main>
  );
}
