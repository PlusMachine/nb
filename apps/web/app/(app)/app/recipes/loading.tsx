import React from "react";
export default function RecipesLoading() {
  return (
    <main className="space-y-4" aria-busy="true">
      <div className="h-8 w-48 animate-pulse rounded bg-zinc-200" />
      <div className="h-32 animate-pulse rounded-xl bg-zinc-200" />
      <div className="h-32 animate-pulse rounded-xl bg-zinc-200" />
    </main>
  );
}
