"use client";

import React from "react";
import { MoreHorizontal } from "lucide-react";

import { DropdownMenu, type DropdownMenuItem } from "@nb/ui";

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
  const visibleItems: DropdownMenuItem[] = items.filter(Boolean);
  if (!visibleItems.length) {
    return null;
  }

  return (
    <div className="md:hidden">
      <DropdownMenu
        trigger={
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-zinc-700 shadow-sm ring-1 ring-black/5 backdrop-blur"
            aria-label="Действия с изображением"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        }
        items={visibleItems}
        align="end"
      />
    </div>
  );
}
