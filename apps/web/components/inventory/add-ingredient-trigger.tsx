"use client";

import React from "react";
import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@nb/ui";
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
      <Button
        type="button"
        size="md"
        onClick={() => setOpen(true)}
        className={`${fullWidth ? "w-full justify-center" : ""} ${className ?? ""}`.trim()}
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
        Добавить ингредиент
      </Button>
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
