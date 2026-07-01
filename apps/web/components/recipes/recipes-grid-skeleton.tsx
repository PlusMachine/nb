import React from "react";

import { defaultPublicRecipePageSize } from "@/features/recipes/contracts";

/**
 * Скелетон под Suspense fallback. Совпадает по геометрии с {@link RecipesGrid}: та
 * же обложка `aspect-[4/3]` и число плейсхолдеров = размеру первой страницы — иначе
 * при появлении данных карточки скачком меняют высоту/количество (CLS). Повторяет
 * выбранный вид (`grid`/`list`), чтобы первый кадр не «прыгал».
 */
export function RecipesGridSkeleton({
  count = defaultPublicRecipePageSize,
  view = "grid"
}: {
  count?: number;
  view?: "grid" | "list";
}) {
  const items = Array.from({ length: count });

  if (view === "list") {
    return (
      <div className="flex flex-col gap-3" aria-hidden>
        {items.map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm"
          >
            <div className="aspect-[4/3] w-24 shrink-0 animate-pulse rounded-lg bg-zinc-100 sm:w-28" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-24 animate-pulse rounded-full bg-zinc-100" />
              <div className="h-5 w-2/3 animate-pulse rounded bg-zinc-100" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-100" />
            </div>
            <div className="hidden shrink-0 gap-5 sm:flex">
              {Array.from({ length: 4 }, (_, cell) => (
                <div key={cell} className="h-8 w-10 animate-pulse rounded bg-zinc-100" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2" aria-hidden>
      {items.map((_, index) => (
        <div key={index} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="aspect-[16/10] w-full animate-pulse bg-zinc-100" />
          <div className="space-y-3 p-4">
            {/* Название (крупное, до 3 строк) → чип стиля → автор → строка статов. */}
            <div className="h-5 w-3/4 animate-pulse rounded bg-zinc-100" />
            <div className="h-5 w-1/2 animate-pulse rounded bg-zinc-100" />
            <div className="h-4 w-28 animate-pulse rounded-full bg-zinc-100" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-100" />
            <div className="grid grid-cols-4 gap-2 border-t border-zinc-100 pt-3">
              {Array.from({ length: 4 }, (_, cell) => (
                <div key={cell} className="h-8 animate-pulse rounded bg-zinc-100" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
