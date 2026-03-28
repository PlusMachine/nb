"use client";

import React from "react";
import { useEffect, useState } from "react";

import { addCustomIngredientAction, addSelectedIngredientAction, type AddIngredientResult } from "@/app/(app)/app/ingredients/actions";
import type {
  IngredientCategory,
  IngredientSuggestionItem,
  IngredientSubtype
} from "@/features/ingredients/contracts";
import type { SystemCurrency } from "@/features/system/currency";

import { CatalogIngredientForm } from "./catalog-ingredient-form";
import { CustomIngredientForm } from "./custom-ingredient-form";

type Props = {
  open: boolean;
  onClose: () => void;
  preferredCurrency?: SystemCurrency;
  initialSelection?: IngredientSuggestionItem | null;
};

type Mode = "catalog" | "custom";
type AddIngredientCategoryValue = IngredientCategory | "all" | "malt" | "fermentable";

const categoryOptions: Array<{
  value: AddIngredientCategoryValue;
  label: string;
}> = [
  { value: "all", label: "Все" },
  { value: "malt", label: "Солода" },
  { value: "fermentable", label: "Сбраживаемое сырье" },
  { value: "hop", label: "Хмель" },
  { value: "yeast", label: "Дрожжи" },
  { value: "water_treatment", label: "Водоподготовка" },
  { value: "consumable", label: "Расходники" }
];

export function AddIngredientModal({
  open,
  onClose,
  preferredCurrency = "RUB",
  initialSelection = null
}: Props) {
  const [catalogCategory, setCatalogCategory] = useState<IngredientCategory | "all">("all");
  const [catalogSubtype, setCatalogSubtype] = useState<Extract<IngredientSubtype, "malt" | "fermentable"> | null>(null);
  const [customCategory, setCustomCategory] = useState<IngredientCategory>("hop");
  const [customSubtype, setCustomSubtype] = useState<Extract<IngredientSubtype, "malt" | "fermentable"> | null>(null);
  const [mode, setMode] = useState<Mode>("catalog");
  const [result, setResult] = useState<AddIngredientResult | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setCatalogCategory(initialSelection?.category ?? "all");
    setCatalogSubtype(initialSelection?.subtype === "malt" || initialSelection?.subtype === "fermentable"
      ? initialSelection.subtype
      : null);
    setCustomCategory(initialSelection?.category ?? "hop");
    setCustomSubtype(initialSelection?.subtype === "malt" || initialSelection?.subtype === "fermentable"
      ? initialSelection.subtype
      : null);
    setMode("catalog");
    setResult(null);
    setPending(false);
  }, [initialSelection, open]);

  if (!open) {
    return null;
  }

  const selectedCategoryValue: AddIngredientCategoryValue = mode === "catalog"
    ? (catalogCategory === "fermentable" && catalogSubtype ? catalogSubtype : catalogCategory)
    : (customCategory === "fermentable" && customSubtype ? customSubtype : customCategory);

  const handleCategoryChange = (nextCategory: AddIngredientCategoryValue) => {
    const nextIsSubtype = nextCategory === "malt" || nextCategory === "fermentable";
    const nextResolvedCategory = nextIsSubtype ? "fermentable" : nextCategory;
    const nextResolvedSubtype = nextIsSubtype ? nextCategory : null;

    if (mode === "catalog") {
      setCatalogCategory(nextResolvedCategory);
      setCatalogSubtype(nextResolvedSubtype);
      if (nextResolvedCategory !== "all") {
        setCustomCategory(nextResolvedCategory);
        setCustomSubtype(nextResolvedSubtype);
      }
      return;
    }

    if (nextResolvedCategory === "all") {
      setCatalogCategory("all");
      setCatalogSubtype(null);
      return;
    }

    setCustomCategory(nextResolvedCategory as IngredientCategory);
    setCustomSubtype(nextResolvedSubtype);
    setCatalogCategory(nextResolvedCategory as IngredientCategory);
    setCatalogSubtype(nextResolvedSubtype);
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
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Категория ингредиента</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {categoryOptions
                .filter((option) => mode === "catalog" || option.value !== "all")
                .map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleCategoryChange(option.value)}
                    className={`rounded-md border px-3 py-2 text-center text-xs transition ${
                      selectedCategoryValue === option.value
                        ? "border-black bg-zinc-100 text-zinc-950"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-2 rounded-md bg-zinc-100 p-1 text-sm">
            <button type="button" onClick={() => setMode("catalog")} className={`rounded px-3 py-2 ${mode === "catalog" ? "bg-white shadow" : ""}`}>Из каталога</button>
            <button type="button" onClick={() => setMode("custom")} className={`rounded px-3 py-2 ${mode === "custom" ? "bg-white shadow" : ""}`}>Свой ингредиент</button>
          </div>

          {result && <p className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>{result.message}</p>}

          {mode === "catalog" ? (
            <CatalogIngredientForm
              category={catalogCategory === "all" ? undefined : catalogCategory}
              subtype={catalogSubtype}
              preferredCurrency={preferredCurrency}
              pending={pending}
              autoFocus
              initialSelection={initialSelection}
              fieldErrors={result?.fieldErrors}
              onRequestCustom={() => setMode("custom")}
              onSubmit={async (payload) => {
                setPending(true);
                const formData = new FormData();
                Object.entries(payload).forEach(([key, value]) => {
                  if (value == null) {
                    return;
                  }

                  formData.set(key, value);
                });
                const nextResult = await addSelectedIngredientAction(null, formData);
                setPending(false);
                await handleSuccess(nextResult);
              }}
            />
          ) : (
            <CustomIngredientForm
              category={customCategory}
              initialSubtype={customSubtype}
              preferredCurrency={preferredCurrency}
              pending={pending}
              fieldErrors={result?.fieldErrors}
              onSubmit={async (payload) => {
                setPending(true);
                const formData = new FormData();
                Object.entries(payload).forEach(([key, value]) => {
                  if (value == null) {
                    return;
                  }

                  formData.set(key, value);
                });
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
