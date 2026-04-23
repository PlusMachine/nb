import React from "react";
import { Loader2 } from "lucide-react";

export default function IngredientsLoading() {
  return (
    <main className="space-y-5" aria-busy="true">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-40 animate-pulse rounded bg-zinc-200" />
          <div className="h-4 w-48 animate-pulse rounded bg-zinc-100" />
        </div>
        <div className="h-12 w-44 animate-pulse rounded-xl bg-zinc-200" />
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
          Загружаем склад
        </div>
      </section>

      <section className="space-y-4">
        {["fermentable", "hop", "yeast"].map((group) => (
          <div key={group} className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 animate-pulse rounded-lg bg-zinc-100" />
              <div className="h-4 w-28 animate-pulse rounded bg-zinc-200" />
              <div className="h-5 w-8 animate-pulse rounded-full bg-zinc-100" />
            </div>
            <div className="space-y-2">
              <div className="h-20 animate-pulse rounded-2xl bg-zinc-100" />
              <div className="h-20 animate-pulse rounded-2xl bg-zinc-100" />
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
