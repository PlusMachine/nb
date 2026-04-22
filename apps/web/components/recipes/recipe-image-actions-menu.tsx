"use client";

import { MoreHorizontal } from "lucide-react";

type RecipeImageActionsMenuItem = {
  key: string;
  label: string;
  tone?: "default" | "danger";
  onSelect: () => void;
};

export function RecipeImageActionsMenu({
  items
}: {
  items: RecipeImageActionsMenuItem[];
}) {
  const visibleItems = items.filter(Boolean);
  if (!visibleItems.length) {
    return null;
  }

  return (
    <details className="relative md:hidden">
      <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full bg-white/90 text-zinc-700 shadow-sm ring-1 ring-black/5 backdrop-blur">
        <MoreHorizontal className="h-4 w-4" />
      </summary>
      <div className="absolute right-0 top-11 z-20 min-w-44 rounded-xl border border-zinc-200 bg-white p-1 shadow-xl">
        {visibleItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm ${item.tone === "danger" ? "text-rose-700 hover:bg-rose-50" : "text-zinc-700 hover:bg-zinc-50"}`}
            onClick={(event) => {
              item.onSelect();
              const parent = event.currentTarget.closest("details");
              if (parent) {
                parent.open = false;
              }
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </details>
  );
}
