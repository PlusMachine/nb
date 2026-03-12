import React from "react";

export default function PublicRecipesLoading() {
  return (
    <main className="space-y-4" aria-busy="true">
      <div className="h-20 animate-pulse rounded-xl bg-zinc-200" />
      <div className="h-40 animate-pulse rounded-xl bg-zinc-200" />
      <div className="h-40 animate-pulse rounded-xl bg-zinc-200" />
    </main>
  );
}
