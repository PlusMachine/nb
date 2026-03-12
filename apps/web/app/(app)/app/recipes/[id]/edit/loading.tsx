import React from "react";

export default function EditRecipeLoading() {
  return (
    <main className="space-y-4" aria-busy="true">
      <div className="h-8 w-64 animate-pulse rounded bg-zinc-200" />
      <div className="h-64 animate-pulse rounded-xl bg-zinc-200" />
    </main>
  );
}
