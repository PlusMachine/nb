import React from "react";
export default function IngredientsLoading() {
  return (
    <main className="space-y-4" aria-busy="true">
      <div className="h-8 w-56 animate-pulse rounded bg-zinc-200" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-24 animate-pulse rounded-lg bg-zinc-200" />
        <div className="h-24 animate-pulse rounded-lg bg-zinc-200" />
        <div className="h-24 animate-pulse rounded-lg bg-zinc-200" />
      </div>
      <div className="h-44 animate-pulse rounded-lg bg-zinc-200" />
    </main>
  );
}
