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
  // Строка-нехватка без каталожной/кастомной привязки (П3): открыть модалку
  // сразу в режиме «Добавить свой» с предзаполненным именем.
  initialDisplayName?: string | null;
  /** Дефицит из «Чего не хватает» (UX-находка #20): предзаполнить количество/единицу. */
  initialQuantity?: string | null;
  initialUnit?: string | null;
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
  initialDisplayName = null,
  initialQuantity = null,
  initialUnit = null,
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
        initialDisplayName={initialDisplayName}
        initialQuantity={initialQuantity}
        initialUnit={initialUnit}
        initialQuickStartDataByContext={initialQuickStartDataByContext}
      />
    </>
  );
}
