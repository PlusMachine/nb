"use client";

import React from "react";
import { useState } from "react";

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
        className={`${fullWidth ? "w-full" : ""} rounded-md bg-black px-4 py-2 text-sm text-white ${className ?? ""}`.trim()}
      >
        Добавить ингредиент
      </button>
      <AddIngredientModal open={open} onClose={() => setOpen(false)} preferredCurrency={preferredCurrency} />
    </>
  );
}
