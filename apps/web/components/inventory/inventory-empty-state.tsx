import React from "react";
export function InventoryEmptyState() {
  return (
    <section className="space-y-3 rounded-lg border border-dashed p-6 text-center">
      <h2 className="text-lg font-semibold">Пока нет ингредиентов</h2>
      <p className="text-sm text-zinc-600">
        Здесь будут ваши запасы солода, хмеля, дрожжей и других ингредиентов. Это база для подбора рецептов и планирования варок.
      </p>
      <div>
        <button
          type="button"
          disabled
          className="cursor-not-allowed rounded-md border bg-zinc-100 px-4 py-2 text-sm text-zinc-500"
          aria-disabled="true"
        >
          Добавить ингредиент (скоро)
        </button>
      </div>
    </section>
  );
}
