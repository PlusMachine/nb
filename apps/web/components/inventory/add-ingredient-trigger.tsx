"use client";

import React from "react";
import { useState } from "react";
import { Plus } from "lucide-react";

import type { SystemCurrency } from "@/features/system/currency";

import { AddIngredientModal } from "./add-ingredient-modal";

type Props = {
  className?: string;
  fullWidth?: boolean;
  preferredCurrency?: SystemCurrency;
};

export function AddIngredientTrigger({ className, fullWidth = false, preferredCurrency = "RUB" }: Props) {
  const [open, setOpen] = useState(false);

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
      <AddIngredientModal open={open} onClose={() => setOpen(false)} preferredCurrency={preferredCurrency} />
    </>
  );
}
