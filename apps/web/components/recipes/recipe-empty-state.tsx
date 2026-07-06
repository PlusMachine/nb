import React from "react";
import Link from "next/link";

export function RecipeEmptyState() {
  return (
    <section className="rounded-xl border border-dashed border-border bg-muted p-6 text-center">
      <h2 className="text-lg font-semibold text-foreground">Пока нет рецептов</h2>
      <p className="mt-2 text-sm text-muted-foreground">Создайте первый рецепт и начните собирать базу для следующих варок.</p>
      <Link href="/app/recipes/new" className="mt-3 inline-flex rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background">
        Создать рецепт
      </Link>
    </section>
  );
}
