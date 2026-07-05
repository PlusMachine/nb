import React from "react";

import { defaultPublicRecipePageSize } from "@/features/recipes/contracts";

/**
 * Скелетон под Suspense fallback. Повторяет геометрию реальных карточек и ту же
 * grid-раскладку `auto-fill/minmax(320px)`, что и {@link RecipesGrid}, а число
 * плейсхолдеров = размеру первой страницы — иначе при появлении данных карточки
 * скачком меняют раскладку/высоту/число колонок (CLS). Повторяет выбранный вид
 * (`grid`/`list`), чтобы первый кадр не «прыгал».
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
      <div className="flex flex-col gap-2" aria-hidden>
        {items.map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-2 pr-12 shadow-sm"
          >
            <div className="aspect-[4/3] w-16 shrink-0 animate-pulse rounded-lg bg-zinc-100 sm:w-20" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-24 animate-pulse rounded-full bg-zinc-100" />
              <div className="h-5 w-2/3 animate-pulse rounded bg-zinc-100" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-100" />
              {/* `<md`: строка статов под названием (как в реальной строке). */}
              <div className="flex gap-4 md:hidden">
                {Array.from({ length: 4 }, (_, cell) => (
                  <div key={cell} className="h-7 w-10 animate-pulse rounded bg-zinc-100" />
                ))}
              </div>
            </div>
            {/* `≥md`: колонки статов ABV/IBU/OG/цвет + слот рейтинга. */}
            <div className="hidden shrink-0 gap-4 md:flex">
              {Array.from({ length: 5 }, (_, cell) => (
                <div key={cell} className="h-8 w-12 animate-pulse rounded bg-zinc-100" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Та же grid-раскладка и геометрия карточки, что у RecipeCard: миниатюра 64×64
  // слева + название, полоса из 4 статов, футер автор/объём. Раньше скелетон рисовал
  // большую обложку сверху и `sm:grid-cols-2` — при загрузке раскладка и число
  // колонок скакали, ровно тот CLS, который скелетон должен убирать.
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5" aria-hidden>
      {items.map((_, index) => (
        <div key={index} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="h-16 w-16 shrink-0 animate-pulse rounded-xl bg-zinc-100" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-24 animate-pulse rounded-full bg-zinc-100" />
              <div className="h-5 w-3/4 animate-pulse rounded bg-zinc-100" />
              <div className="h-5 w-1/2 animate-pulse rounded bg-zinc-100" />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 rounded-xl bg-zinc-50 p-2.5">
            {Array.from({ length: 4 }, (_, cell) => (
              <div key={cell} className="h-8 animate-pulse rounded bg-zinc-100" />
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="h-4 w-24 animate-pulse rounded-full bg-zinc-100" />
            <div className="h-4 w-10 animate-pulse rounded bg-zinc-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
