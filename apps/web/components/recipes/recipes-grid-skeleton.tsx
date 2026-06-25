import React from "react";

/** Скелетон сетки под Suspense fallback (та же раскладка, что у `RecipesGrid`). */
export function RecipesGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="h-[62px] w-full animate-pulse bg-zinc-100" />
          <div className="space-y-3 p-4">
            <div className="h-4 w-24 animate-pulse rounded-full bg-zinc-100" />
            <div className="h-5 w-3/4 animate-pulse rounded bg-zinc-100" />
            <div className="h-5 w-1/2 animate-pulse rounded bg-zinc-100" />
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
