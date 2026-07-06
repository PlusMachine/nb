import Link from "next/link";
import React from "react";

export function PublicRecipeNotFoundState() {
  return (
    <main>
      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h1 className="text-xl font-semibold text-foreground">Рецепт не найден</h1>
        <p className="text-sm text-muted-foreground">Рецепт не существует, снят с публикации или недоступен публично.</p>
        <Link href="/" className="text-sm font-medium text-link hover:text-link/80">Вернуться на главную</Link>
      </section>
    </main>
  );
}
