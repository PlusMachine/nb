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
      <section className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-10 text-center">
        <h2 className="text-lg font-semibold text-zinc-900">Ничего не найдено</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600">
          По выбранным фильтрам нет рецептов. Попробуйте смягчить условия или сбросить фильтры.
        </p>
        <Link
          href="/recipes"
          className="mt-4 inline-flex items-center rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          Сбросить фильтры
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-10 text-center">
      <h2 className="text-lg font-semibold text-zinc-900">Публичных рецептов пока нет</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600">
        Как только авторы опубликуют рецепты, они появятся здесь. Создайте свой — он может стать первым.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/app/recipes"
          className="inline-flex items-center rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          Создать рецепт
        </Link>
        {!isAuthenticated ? (
          <Link
            href="/login"
            className="inline-flex items-center rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-white"
          >
            Войти
          </Link>
        ) : null}
      </div>
    </section>
  );
}
