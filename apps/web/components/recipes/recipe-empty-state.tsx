import React from "react";
export function RecipeEmptyState() {
  return (
    <section className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center">
      <h2 className="text-lg font-semibold text-zinc-900">Пока нет рецептов</h2>
      <p className="mt-2 text-sm text-zinc-600">Скоро здесь появится создание рецептов. Сейчас можно просматривать уже существующие рецепты.</p>
      <p className="mt-3 text-sm font-medium text-zinc-700">Создать рецепт (скоро)</p>
    </section>
  );
}
