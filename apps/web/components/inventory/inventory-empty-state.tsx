import React from "react";

import { AddIngredientTrigger } from "./add-ingredient-trigger";

export function InventoryEmptyState() {
  return (
    <section className="space-y-3 rounded-lg border border-dashed p-6 text-center">
      <h2 className="text-lg font-semibold">Пока нет ингредиентов</h2>
      <p className="text-sm text-zinc-600">
        Здесь будут ваши запасы солода, хмеля, дрожжей и других ингредиентов. Это база для подбора рецептов и планирования варок.
      </p>
      <div>
        <AddIngredientTrigger fullWidth className="sm:w-auto" />
      </div>
    </section>
  );
}
