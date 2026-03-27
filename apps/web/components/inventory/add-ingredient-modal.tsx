"use client";

import React from "react";
import { useEffect, useState } from "react";

import { addCatalogIngredientAction, addCustomIngredientAction, type AddIngredientResult } from "@/app/(app)/app/ingredients/actions";
import type { IngredientCategory } from "@/features/ingredients/contracts";
import {
  IngredientCategorySelector,
  type IngredientCategorySelectorValue
} from "@/components/ingredients/ingredient-category-selector";
import type { SystemCurrency } from "@/features/system/currency";

import { CatalogIngredientForm } from "./catalog-ingredient-form";
import { CustomIngredientForm } from "./custom-ingredient-form";

type Props = {
  open: boolean;
  onClose: () => void;
  preferredCurrency?: SystemCurrency;
};

type Mode = "catalog" | "custom";

export function AddIngredientModal({ open, onClose, preferredCurrency = "RUB" }: Props) {
  const [catalogCategory, setCatalogCategory] = useState<IngredientCategorySelectorValue>("all");
  const [customCategory, setCustomCategory] = useState<IngredientCategory>("hop");
  const [mode, setMode] = useState<Mode>("catalog");
  const [result, setResult] = useState<AddIngredientResult | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setCatalogCategory("all");
    setMode("catalog");
    setResult(null);
    setPending(false);
  }, [open]);

  if (!open) {
    return null;
  }

  const handleCategoryChange = (nextCategory: IngredientCategorySelectorValue) => {
    if (mode === "catalog") {
      setCatalogCategory(nextCategory);
      if (nextCategory !== "all") {
        setCustomCategory(nextCategory);
      }
      return;
    }

    setCustomCategory(nextCategory as IngredientCategory);
    setCatalogCategory(nextCategory);
  };

  const handleSuccess = async (nextResult: AddIngredientResult) => {
    setResult(nextResult);
    if (nextResult.ok) {
      onClose();
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Добавить ингредиент"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 sm:max-w-2xl sm:rounded-xl" data-testid="add-ingredient-modal">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-950">Добавить ингредиент</h2>
          <button type="button" className="text-sm text-zinc-500 transition-colors hover:text-zinc-700" onClick={onClose}>Закрыть</button>
        </div>

        <div className="space-y-4">
          <IngredientCategorySelector
            value={mode === "catalog" ? catalogCategory : customCategory}
            onChange={handleCategoryChange}
            includeAll={mode === "catalog"}
          />

          <div className="grid grid-cols-2 gap-2 rounded-md bg-zinc-100 p-1 text-sm">
            <button type="button" onClick={() => setMode("catalog")} className={`rounded px-3 py-2 ${mode === "catalog" ? "bg-white shadow" : ""}`}>Из каталога</button>
            <button type="button" onClick={() => setMode("custom")} className={`rounded px-3 py-2 ${mode === "custom" ? "bg-white shadow" : ""}`}>Свой ингредиент</button>
          </div>

          {result && <p className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>{result.message}</p>}

          {mode === "catalog" ? (
            <CatalogIngredientForm
              category={catalogCategory === "all" ? undefined : catalogCategory}
              preferredCurrency={preferredCurrency}
              pending={pending}
              autoFocus
              fieldErrors={result?.fieldErrors}
              onRequestCustom={() => setMode("custom")}
              onSubmit={async (payload) => {
                setPending(true);
                const formData = new FormData();
                Object.entries(payload).forEach(([key, value]) => formData.set(key, value));
                const nextResult = await addCatalogIngredientAction(null, formData);
                setPending(false);
                await handleSuccess(nextResult);
              }}
            />
          ) : (
            <CustomIngredientForm
              category={customCategory}
              preferredCurrency={preferredCurrency}
              pending={pending}
              fieldErrors={result?.fieldErrors}
              onSubmit={async (payload) => {
                setPending(true);
                const formData = new FormData();
                Object.entries(payload).forEach(([key, value]) => formData.set(key, value));
                const nextResult = await addCustomIngredientAction(null, formData);
                setPending(false);
                await handleSuccess(nextResult);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
