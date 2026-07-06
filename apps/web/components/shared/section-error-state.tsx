"use client";

import React from "react";

type Props = { title: string; message: string; reset: () => void };

/**
 * Общий рендер `error.tsx`-границы: заголовок + текст + «Повторить». Раньше
 * был продублирован (`RecipeErrorState`, инлайн-разметка в
 * ingredients/error.tsx) — теперь единственный источник разметки для всех зон.
 * `role="alert"` — это результат сбойной операции, экранным читалкам нужно
 * анонсировать его немедленно.
 */
export function SectionErrorState({ title, message, reset }: Props) {
  return (
    <main>
      <section className="space-y-3 rounded-lg border border-destructive-border bg-destructive-subtle p-4 text-destructive-subtle-foreground" role="alert">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm">{message}</p>
        <button type="button" onClick={reset} className="rounded-md border border-destructive-border bg-card px-3 py-2 text-sm">
          Повторить
        </button>
      </section>
    </main>
  );
}
