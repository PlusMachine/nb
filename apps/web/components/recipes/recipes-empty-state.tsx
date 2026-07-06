import React from "react";
import Link from "next/link";

/**
 * Пустые состояния витрины (§5 ТЗ):
 * - `no-results` — фильтры активны, но ничего не нашлось (сброс фильтров);
 * - `no-recipes` — опубликованных рецептов пока нет вовсе (CTA создать/войти).
 */
export function RecipesEmptyState({
  variant,
  isAuthenticated = false
}: {
  variant: "no-results" | "no-recipes";
  isAuthenticated?: boolean;
}) {
  if (variant === "no-results") {
    return (
      <section className="rounded-2xl border border-dashed border-border bg-muted p-10 text-center">
        <h2 className="text-lg font-semibold text-foreground">Ничего не найдено</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          По выбранным фильтрам нет рецептов. Попробуйте смягчить условия или сбросить фильтры.
        </p>
        <Link
          href="/recipes"
          className="mt-4 inline-flex items-center rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:bg-foreground/90"
        >
          Сбросить фильтры
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-dashed border-border bg-muted p-10 text-center">
      <h2 className="text-lg font-semibold text-foreground">Публичных рецептов пока нет</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Как только авторы опубликуют рецепты, они появятся здесь. Создайте свой — он может стать первым.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/app/recipes"
          className="inline-flex items-center rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:bg-foreground/90"
        >
          Создать рецепт
        </Link>
        {!isAuthenticated ? (
          <Link
            href="/login"
            className="inline-flex items-center rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-card"
          >
            Войти
          </Link>
        ) : null}
      </div>
    </section>
  );
}
