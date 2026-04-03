"use client";

import React from "react";
import { useEffect, useState } from "react";

import { IngredientPicker, IngredientSelectionCard } from "@/components/ingredients/ingredient-picker";
import { InventoryPriceInput } from "@/components/inventory/inventory-price-input";
import type {
  IngredientCategory,
  IngredientSubtype,
  IngredientSuggestionItem
} from "@/features/ingredients/contracts";
import { resolveIngredientDisplayNames } from "@/features/ingredients/presentation";
import type { InventoryPriceInputMode } from "@/features/inventory/purchase-cost";
import {
  getInventoryUnitInputStep,
  inventoryUnitLabels,
  resolveHumanFacingInventoryUnitProfile,
  type InventoryUnit
} from "@/features/inventory/units";
import { resolveInventoryPackEquivalent } from "@/features/inventory/pack";
import type { SystemCurrency } from "@/features/system/currency";
import { getTodayDateInputValue } from "./date-input";

type InventoryCommonFields = {
  enteredQuantity: string;
  enteredUnit: InventoryUnit;
  priceInputMode: InventoryPriceInputMode;
  priceInputAmount: string;
  purchasedAt: string;
  freshnessDate: string;
  notes: string;
};

type Props = {
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  preferredCurrency: SystemCurrency;
  pending: boolean;
  autoFocus?: boolean;
  initialSelection?: IngredientSuggestionItem | null;
  fieldErrors?: Record<string, string>;
  onSubmit: (payload: {
    ingredientCatalogItemId?: string;
    userCustomIngredientId?: string;
    enteredQuantity: string;
    enteredUnit: InventoryUnit;
    priceInputMode: InventoryPriceInputMode;
    priceInputAmount: string;
    purchasedAt: string;
    freshnessDate: string;
    notes: string;
  }) => Promise<void>;
  onRequestCustom: () => void;
};

const createInitialCommonFields = (category?: IngredientCategory): InventoryCommonFields => {
  const unitProfile = resolveHumanFacingInventoryUnitProfile({ category });
  return {
    enteredQuantity: "",
    enteredUnit: unitProfile.defaultUnit,
    priceInputMode: "total",
    priceInputAmount: "",
    purchasedAt: getTodayDateInputValue(),
    freshnessDate: "",
    notes: ""
  };
};

export const resolveCatalogIngredientUnitProfile = (
  category?: IngredientCategory,
  selected?: IngredientSuggestionItem | null
) => resolveHumanFacingInventoryUnitProfile({
  type: selected?.type,
  category: selected?.category ?? category,
  subtype: selected?.subtype ?? null,
  defaultDisplayUnit: selected?.defaultDisplayUnit ?? selected?.defaultUnit,
  allowedUnits: selected?.allowedUnits,
  measurementDimension: selected?.measurementDimension,
  technicalData: selected?.technicalData ?? null
});

export const buildCatalogIngredientPayload = (selected: IngredientSuggestionItem | null, fields: InventoryCommonFields) => {
  if (!selected?.id) {
    throw new Error("CATALOG_SELECTION_REQUIRED");
  }

  return {
    ingredientCatalogItemId: selected.source === "catalog" ? selected.id : undefined,
    userCustomIngredientId: selected.source === "custom" ? selected.id : undefined,
    ...fields
  };
};

export function CatalogIngredientForm({
  category,
  subtype,
  preferredCurrency,
  pending,
  autoFocus = false,
  initialSelection = null,
  fieldErrors,
  onSubmit,
  onRequestCustom
}: Props) {
  const [selected, setSelected] = useState<IngredientSuggestionItem | null>(initialSelection);
  const [pickerValue, setPickerValue] = useState(() => initialSelection ? resolveIngredientDisplayNames(initialSelection).primaryName : "");
  const [fields, setFields] = useState<InventoryCommonFields>(() => createInitialCommonFields(category));
  const [localError, setLocalError] = useState<string | null>(null);
  const unitProfile = resolveCatalogIngredientUnitProfile(category, selected);
  const quantityStep = getInventoryUnitInputStep(fields.enteredUnit);
  const selectedPackEquivalent = selected ? resolveInventoryPackEquivalent(selected.technicalData ?? null) : null;

  useEffect(() => {
    setSelected(initialSelection);
    setPickerValue(initialSelection ? resolveIngredientDisplayNames(initialSelection).primaryName : "");
    setFields(createInitialCommonFields(category));
    setLocalError(null);
  }, [category, initialSelection]);

  useEffect(() => {
    if (!initialSelection) {
      return;
    }

    const nextUnitProfile = resolveCatalogIngredientUnitProfile(category, initialSelection);
    setFields((current) => ({
      ...current,
      enteredUnit: nextUnitProfile.defaultUnit
    }));
  }, [category, initialSelection]);

  const purchasePriceError = fieldErrors?.priceInputAmountMinor ?? fieldErrors?.purchasePriceMinor ?? fieldErrors?.purchasePrice;
  const clearSelectedIngredient = () => {
    setSelected(null);
    setPickerValue("");
    setLocalError(null);
    const resetProfile = resolveCatalogIngredientUnitProfile(category, null);
    setFields((current) => ({
      ...current,
      enteredUnit: resetProfile.defaultUnit
    }));
  };

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          const payload = buildCatalogIngredientPayload(selected, fields);
          setLocalError(null);
          await onSubmit(payload);
        } catch (error) {
          if (error instanceof Error && error.message === "CATALOG_SELECTION_REQUIRED") {
            setLocalError("Выберите ингредиент из каталога.");
            return;
          }

          throw error;
        }
      }}
    >
      <div className="space-y-1">
        <label className="text-sm font-medium">Ингредиент</label>
        <IngredientPicker
          value={pickerValue}
          category={category}
          subtype={subtype}
          autoFocus={autoFocus}
          onValueChange={(nextValue) => {
            setPickerValue(nextValue);
            setLocalError(null);
            if (selected && nextValue.trim() !== selected.displayName) {
              clearSelectedIngredient();
            }
          }}
          onSelect={(item) => {
            setSelected(item);
            setPickerValue(resolveIngredientDisplayNames(item).primaryName);
            setLocalError(null);
            const nextUnitProfile = resolveCatalogIngredientUnitProfile(category, item);
            setFields((current) => {
              return {
                ...current,
                enteredUnit: nextUnitProfile.defaultUnit
              };
            });
          }}
          placeholder="Начните вводить название ингредиента"
          emptyCta={<button type="button" onClick={onRequestCustom} className="text-sm text-blue-700 underline">Не нашли? Добавить свой ингредиент</button>}
        />
        {selected ? (
          <div className="space-y-2">
            <IngredientSelectionCard item={selected} onClear={clearSelectedIngredient} />
            {selectedPackEquivalent ? (
              <p className="text-xs text-zinc-500">
                1 pack = {selectedPackEquivalent.normalizedQuantity} {selectedPackEquivalent.normalizedUnit}
              </p>
            ) : null}
          </div>
        ) : null}
        {(localError || fieldErrors?.ingredientCatalogItemId) && <p className="text-xs text-red-600">{localError ?? fieldErrors?.ingredientCatalogItemId}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Количество
          <input
            type="number"
            min="0"
            step={quantityStep}
            className="mt-1 w-full rounded-md border px-2 py-2"
            value={fields.enteredQuantity}
            onChange={(e) => setFields((s) => ({ ...s, enteredQuantity: e.target.value }))}
            inputMode="decimal"
          />
          {fieldErrors?.enteredQuantity && <span className="text-xs text-red-600">{fieldErrors.enteredQuantity}</span>}
        </label>
        <label className="text-sm">Ед. изм.
          <select
            className="mt-1 w-full rounded-md border px-2 py-2"
            value={fields.enteredUnit}
            onChange={(e) => setFields((s) => ({ ...s, enteredUnit: e.target.value as InventoryUnit }))}
          >
            {unitProfile.allowedUnits.map((unit) => <option key={unit} value={unit}>{inventoryUnitLabels[unit]}</option>)}
          </select>
          {fieldErrors?.enteredUnit && <span className="text-xs text-red-600">{fieldErrors.enteredUnit}</span>}
        </label>
        <label className="text-sm">Дата покупки
          <div className="mt-1 flex items-center gap-2">
            <input
              type="date"
              className="w-full rounded-md border px-2 py-2"
              value={fields.purchasedAt}
              onChange={(e) => setFields((s) => ({ ...s, purchasedAt: e.target.value }))}
            />
            <button
              type="button"
              className="rounded-md border border-zinc-200 px-2 py-2 text-xs text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
              onClick={() => setFields((s) => ({ ...s, purchasedAt: "" }))}
              aria-label="Очистить дату покупки"
            >
              ×
            </button>
          </div>
        </label>
        <label className="text-sm">Годен до
          <input type="date" className="mt-1 w-full rounded-md border px-2 py-2" value={fields.freshnessDate} onChange={(e) => setFields((s) => ({ ...s, freshnessDate: e.target.value }))} />
        </label>
      </div>

      <InventoryPriceInput
        preferredCurrency={preferredCurrency}
        priceInputMode={fields.priceInputMode}
        priceInputAmount={fields.priceInputAmount}
        enteredQuantity={fields.enteredQuantity}
        enteredUnit={fields.enteredUnit}
        fieldError={purchasePriceError}
        onPriceInputModeChange={(mode) => setFields((current) => ({ ...current, priceInputMode: mode }))}
        onPriceInputAmountChange={(value) => setFields((current) => ({ ...current, priceInputAmount: value }))}
        type={selected?.type}
        category={selected?.category ?? category}
        subtype={selected?.subtype ?? null}
        defaultDisplayUnit={selected?.defaultDisplayUnit ?? selected?.defaultUnit}
        allowedUnits={selected?.allowedUnits}
        measurementDimension={selected?.measurementDimension}
        technicalData={selected?.technicalData ?? null}
      />

      <label className="block text-sm">Заметки
        <textarea className="mt-1 h-20 w-full rounded-md border px-2 py-2" value={fields.notes} onChange={(e) => setFields((s) => ({ ...s, notes: e.target.value }))} />
      </label>

      <button type="submit" disabled={pending} className="w-full rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60">
        {pending ? "Сохранение..." : "Добавить в запасы"}
      </button>
    </form>
  );
}
