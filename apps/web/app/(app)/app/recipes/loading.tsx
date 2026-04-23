import React from "react";

export function RecipesLoadingSkeleton() {
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
        <div className="h-32 animate-pulse rounded-xl bg-zinc-100" />
        <div className="h-32 animate-pulse rounded-xl bg-zinc-100" />
        <div className="h-32 animate-pulse rounded-xl bg-zinc-100" />
      </section>
    </main>
  );
}

export default function RecipesLoading() {
  return <RecipesLoadingSkeleton />;
}
