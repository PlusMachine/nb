import React from "react";
import { Loader2 } from "lucide-react";

const skeletonRows = Array.from({ length: 6 }, (_, index) => index);

export function CatalogLoadingSkeleton() {
  return (
    <main className="space-y-6" aria-busy="true">
      <section className="space-y-3">
        <div className="h-6 w-44 animate-pulse rounded-full bg-zinc-200" />
        <div className="space-y-2">
          <div className="h-9 w-72 max-w-full animate-pulse rounded bg-zinc-200" />
          <div className="h-4 w-full max-w-2xl animate-pulse rounded bg-zinc-100" />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="h-10 w-full animate-pulse rounded-xl bg-zinc-100 sm:max-w-sm" />
          <div className="flex gap-2">
            <div className="h-10 w-24 animate-pulse rounded-xl bg-zinc-100" />
            <div className="h-10 w-24 animate-pulse rounded-xl bg-zinc-100" />
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем каталог
        </div>
      </section>

      <section className="hidden overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-sm lg:block">
        <div className="grid grid-cols-[2fr_1fr_1.4fr_0.8fr] gap-4 bg-zinc-50 px-5 py-4">
          <div className="h-3 w-24 animate-pulse rounded bg-zinc-200" />
          <div className="h-3 w-16 animate-pulse rounded bg-zinc-200" />
          <div className="h-3 w-24 animate-pulse rounded bg-zinc-200" />
          <div className="h-3 w-20 animate-pulse rounded bg-zinc-200" />
        </div>
        {skeletonRows.map((row) => (
          <div key={row} className="grid grid-cols-[2fr_1fr_1.4fr_0.8fr] gap-4 border-t border-zinc-100 px-5 py-4">
            <div className="space-y-2">
              <div className="h-4 w-48 animate-pulse rounded bg-zinc-200" />
              <div className="h-3 w-32 animate-pulse rounded bg-zinc-100" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-24 animate-pulse rounded bg-zinc-200" />
              <div className="h-3 w-20 animate-pulse rounded bg-zinc-100" />
            </div>
            <div className="flex gap-2">
              <div className="h-6 w-20 animate-pulse rounded-md bg-zinc-100" />
              <div className="h-6 w-20 animate-pulse rounded-md bg-zinc-100" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-16 animate-pulse rounded bg-zinc-100" />
              <div className="h-3 w-20 animate-pulse rounded bg-zinc-100" />
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-3 lg:hidden">
        {skeletonRows.slice(0, 4).map((row) => (
          <div key={row} className="rounded-[24px] border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="space-y-3">
              <div className="h-5 w-3/4 animate-pulse rounded bg-zinc-200" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-100" />
              <div className="flex gap-2">
                <div className="h-6 w-20 animate-pulse rounded-md bg-zinc-100" />
                <div className="h-6 w-20 animate-pulse rounded-md bg-zinc-100" />
              </div>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

export default function CatalogLoading() {
  return <CatalogLoadingSkeleton />;
}
