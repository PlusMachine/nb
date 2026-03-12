"use client";

import React from "react";
export function RecipeErrorState({ title, message, reset }: { title: string; message: string; reset: () => void }) {
  return (
    <main>
      <section className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm">{message}</p>
        <button type="button" onClick={reset} className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm">
          Повторить
        </button>
      </section>
    </main>
  );
}
