"use client";

import React from "react";
import { useState } from "react";
import { Plus } from "lucide-react";

import type {
  IngredientCategory,
  IngredientPickerQuickStartResultByContext,
  IngredientSuggestionItem,
  IngredientSubtype
} from "@/features/ingredients/contracts";
import type { SystemCurrency } from "@/features/system/currency";

import { AddIngredientModal } from "./add-ingredient-modal";

type Props = {
  className?: string;
  fullWidth?: boolean;
  preferredCurrency?: SystemCurrency;
  initialSelection?: IngredientSuggestionItem | null;
  initialCategory?: IngredientCategory | null;
  initialSubtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  initialGroup?: string | null;
  initialQuickStartDataByContext?: IngredientPickerQuickStartResultByContext | null;
  openOnMount?: boolean;
};

export function AddIngredientTrigger({
  className,
  fullWidth = false,
  preferredCurrency = "RUB",
  initialSelection = null,
  initialCategory = null,
  initialSubtype = null,
  initialGroup = null,
  initialQuickStartDataByContext = null,
  openOnMount = false
}: Props) {
  const [open, setOpen] = useState(openOnMount);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${fullWidth ? "w-full justify-center" : ""} inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-zinc-800 hover:shadow-md active:scale-[0.97] ${className ?? ""}`.trim()}
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
        Добавить ингредиент
      </button>
      <AddIngredientModal
        open={open}
        onClose={() => setOpen(false)}
        preferredCurrency={preferredCurrency}
        initialSelection={initialSelection}
        initialCategory={initialCategory}
        initialSubtype={initialSubtype}
        initialGroup={initialGroup}
        initialQuickStartDataByContext={initialQuickStartDataByContext}
      />
    </>
  );
}
