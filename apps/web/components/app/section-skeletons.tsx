import React from "react";
import { Loader2 } from "lucide-react";

const catalogRows = Array.from({ length: 6 }, (_, index) => index);
const inventoryGroups = ["fermentable", "hop", "yeast"] as const;
const recipeRows = Array.from({ length: 3 }, (_, index) => index);
const equipmentRows = Array.from({ length: 3 }, (_, index) => index);

export function CatalogPageSkeleton() {
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
        {catalogRows.map((row) => (
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
        {catalogRows.slice(0, 4).map((row) => (
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

export function IngredientsPageSkeleton() {
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
        {inventoryGroups.map((group) => (
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

export function RecipesPageSkeleton() {
  return (
    <main className="space-y-4" aria-busy="true">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="h-8 w-48 animate-pulse rounded bg-zinc-200" />
          <div className="h-9 w-32 animate-pulse rounded-md bg-zinc-200" />
        </div>
        <div className="h-4 w-full max-w-2xl animate-pulse rounded bg-zinc-100" />
      </section>
      <section className="space-y-3">
        {recipeRows.map((row) => (
          <div key={row} className="h-32 animate-pulse rounded-xl bg-zinc-100" />
        ))}
      </section>
    </main>
  );
}

export function EquipmentPageSkeleton() {
  return (
    <main className="space-y-5" aria-busy="true">
      <section className="rounded-lg border border-zinc-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="h-7 w-48 animate-pulse rounded bg-zinc-200" />
            <div className="h-4 w-40 animate-pulse rounded bg-zinc-100" />
          </div>
          <div className="h-10 w-40 animate-pulse rounded-md bg-zinc-200" />
        </div>
      </section>

      <section className="space-y-4">
        {equipmentRows.map((row) => (
          <div key={row} className="rounded-lg border border-zinc-100 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="h-6 w-36 animate-pulse rounded bg-zinc-200" />
                <div className="h-4 w-24 animate-pulse rounded bg-zinc-100" />
              </div>
              <div className="flex gap-2">
                <div className="h-9 w-28 animate-pulse rounded-md bg-zinc-100" />
                <div className="h-9 w-28 animate-pulse rounded-md bg-zinc-100" />
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className="h-16 animate-pulse rounded-md bg-zinc-50" />
              <div className="h-16 animate-pulse rounded-md bg-zinc-50" />
              <div className="h-16 animate-pulse rounded-md bg-zinc-50" />
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

export function GenericSectionSkeleton() {
  return (
    <main className="space-y-5" aria-busy="true">
      <section className="space-y-2">
        <div className="h-8 w-40 animate-pulse rounded bg-zinc-200" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-zinc-100" />
      </section>
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="space-y-3">
          <div className="h-12 animate-pulse rounded-xl bg-zinc-100" />
          <div className="h-32 animate-pulse rounded-xl bg-zinc-100" />
          <div className="h-24 animate-pulse rounded-xl bg-zinc-100" />
        </div>
      </section>
    </main>
  );
}
