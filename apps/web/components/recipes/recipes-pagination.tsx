"use client";

import Link from "next/link";
import React from "react";

import { useRecipeQueryNav } from "./use-recipe-query";

/** Окно номеров страниц с многоточиями: 1 … c-1 c c+1 … N. */
const buildPageWindow = (current: number, total: number): (number | "…")[] => {
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const result: (number | "…")[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) {
      result.push("…");
    }
    result.push(page);
    previous = page;
  }
  return result;
};

/**
 * Интерактивная numbered-пагинация через URL. Рендерит `Link` (краулабельно, §7),
 * клиентская навигация сохраняет скелетон Suspense. Меняет только `page`, прочие
 * параметры мержатся (`resetPage:false`).
 */
export function RecipesPagination({ current, totalPages }: { current: number; totalPages: number }) {
  const { buildHref } = useRecipeQueryNav();

  if (totalPages <= 1) {
    return null;
  }

  const hrefFor = (page: number) => buildHref({ page: String(page) }, { resetPage: false });
  const window = buildPageWindow(current, totalPages);

  // Краулабельные <Link> (rel prev/next) сохраняем; `scroll={false}` гасит прыжок
  // Next к самому верху страницы, вместо этого скроллим к началу результатов.
  const scrollToResultsTop = () => {
    document.getElementById("recipes-top")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const baseClass = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm font-medium transition";
  const idleClass = `${baseClass} border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50`;
  const mutedClass = `${baseClass} border-zinc-100 text-zinc-300`;

  return (
    <nav className="flex flex-wrap items-center justify-center gap-2" aria-label="Пагинация">
      {current > 1 ? (
        <Link href={hrefFor(current - 1)} rel="prev" scroll={false} onClick={scrollToResultsTop} className={idleClass}>
          Назад
        </Link>
      ) : (
        <span className={mutedClass} aria-hidden>
          Назад
        </span>
      )}

      {window.map((entry, index) =>
        entry === "…" ? (
          <span key={`gap-${index}`} className="px-1 text-zinc-400">
            …
          </span>
        ) : entry === current ? (
          <span
            key={entry}
            aria-current="page"
            className={`${baseClass} border-zinc-950 bg-zinc-950 text-white`}
          >
            {entry}
          </span>
        ) : (
          <Link key={entry} href={hrefFor(entry)} scroll={false} onClick={scrollToResultsTop} className={idleClass}>
            {entry}
          </Link>
        )
      )}

      {current < totalPages ? (
        <Link href={hrefFor(current + 1)} rel="next" scroll={false} onClick={scrollToResultsTop} className={idleClass}>
          Дальше
        </Link>
      ) : (
        <span className={mutedClass} aria-hidden>
          Дальше
        </span>
      )}
    </nav>
  );
}
