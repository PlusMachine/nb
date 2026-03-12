import React from "react";

export default function PublicRecipeLoading() {
  return (
    <main className="space-y-4" aria-busy="true">
      <div className="h-28 animate-pulse rounded-xl bg-zinc-200" />
      <div className="h-28 animate-pulse rounded-xl bg-zinc-200" />
      <div className="h-24 animate-pulse rounded-xl bg-zinc-200" />
      <div className="h-48 animate-pulse rounded-xl bg-zinc-200" />
    </main>
  );
}
