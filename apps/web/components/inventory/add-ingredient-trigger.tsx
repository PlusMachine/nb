"use client";

import React from "react";
import { useState } from "react";
import { Plus } from "lucide-react";

import type { IngredientSuggestionItem } from "@/features/ingredients/contracts";
import type { IngredientCategory, IngredientSubtype } from "@/features/ingredients/contracts";
import type { SystemCurrency } from "@/features/system/currency";

import { AddIngredientModal } from "./add-ingredient-modal";

type Props = {
  className?: string;
  fullWidth?: boolean;
  preferredCurrency?: SystemCurrency;
  initialSelection?: IngredientSuggestionItem | null;
  initialCategory?: IngredientCategory;
  initialSubtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  openOnMount?: boolean;
};

export function AddIngredientTrigger({
  className,
  fullWidth = false,
  preferredCurrency = "RUB",
  initialSelection = null,
  initialCategory = "hop",
  initialSubtype = null,
  openOnMount = false
}: Props) {
  const [open, setOpen] = useState(openOnMount);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${fullWidth ? "w-full" : ""} inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 ${className ?? ""}`.trim()}
      >
        <Plus className="h-4 w-4" />
        Добавить ингредиент
      </button>
      <AddIngredientModal
        open={open}
        onClose={() => setOpen(false)}
        preferredCurrency={preferredCurrency}
        initialSelection={initialSelection}
        initialCategory={initialCategory}
        initialSubtype={initialSubtype}
      />
    </>
  );
}
