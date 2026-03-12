import React from "react";
import Link from "next/link";

export function RecipeEmptyState() {
  return (
    <section className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center">
      <h2 className="text-lg font-semibold text-zinc-900">Пока нет рецептов</h2>
      <p className="mt-2 text-sm text-zinc-600">Создайте первый рецепт и начните собирать базу для следующих варок.</p>
      <Link href="/app/recipes/new" className="mt-3 inline-flex rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white">
        Создать рецепт
      </Link>
    </section>
  );
}
