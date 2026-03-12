import Link from "next/link";
import React from "react";

export function PublicRecipeNotFoundState() {
  return (
    <main>
      <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5">
        <h1 className="text-xl font-semibold text-zinc-900">Рецепт не найден</h1>
        <p className="text-sm text-zinc-600">Рецепт не существует, снят с публикации или недоступен публично.</p>
        <Link href="/" className="text-sm font-medium text-blue-700 hover:text-blue-900">Вернуться на главную</Link>
      </section>
    </main>
  );
}
