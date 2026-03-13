"use client";

import React from "react";
import { useEffect, useState } from "react";

import { IngredientPicker } from "@/components/ingredients/ingredient-picker";
import type {
  IngredientCategory,
  IngredientSuggestionItem
} from "@/features/ingredients/contracts";
import {
  inventoryUnitLabels,
  resolveInventoryUnitProfile,
  type InventoryUnit
} from "@/features/inventory/units";
import type { SystemCurrency } from "@/features/system/currency";

type InventoryCommonFields = {
  enteredQuantity: string;
  enteredUnit: InventoryUnit;
  purchasePrice: string;
  purchaseCurrency: SystemCurrency;
  purchaseQuantity: string;
  purchaseQuantityUnit: InventoryUnit;
  purchasedAt: string;
  freshnessDate: string;
  notes: string;
};

type Props = {
  category: IngredientCategory;
  preferredCurrency: SystemCurrency;
  pending: boolean;
  fieldErrors?: Record<string, string>;
  onSubmit: (payload: {
    ingredientCatalogItemId: string;
    enteredQuantity: string;
    enteredUnit: InventoryUnit;
    purchasePrice: string;
    purchaseCurrency: SystemCurrency;
    purchaseQuantity: string;
    purchaseQuantityUnit: InventoryUnit;
    purchasedAt: string;
    freshnessDate: string;
    notes: string;
  }) => Promise<void>;
  onRequestCustom: () => void;
};

const createInitialCommonFields = (category: IngredientCategory, preferredCurrency: SystemCurrency): InventoryCommonFields => {
  const unitProfile = resolveInventoryUnitProfile({ category });
  return {
    enteredQuantity: "",
    enteredUnit: unitProfile.defaultUnit,
    purchasePrice: "",
    purchaseCurrency: preferredCurrency,
    purchaseQuantity: "",
    purchaseQuantityUnit: unitProfile.defaultUnit,
    purchasedAt: "",
    freshnessDate: "",
    notes: ""
  };
};

export const resolveCatalogIngredientUnitProfile = (
  category: IngredientCategory,
  selected?: IngredientSuggestionItem | null
) => resolveInventoryUnitProfile({
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
    ingredientCatalogItemId: selected.id,
    ...fields
  };
};

export function CatalogIngredientForm({ category, preferredCurrency, pending, fieldErrors, onSubmit, onRequestCustom }: Props) {
  const [selected, setSelected] = useState<IngredientSuggestionItem | null>(null);
  const [pickerValue, setPickerValue] = useState("");
  const [fields, setFields] = useState<InventoryCommonFields>(() => createInitialCommonFields(category, preferredCurrency));
  const [localError, setLocalError] = useState<string | null>(null);
  const unitProfile = resolveCatalogIngredientUnitProfile(category, selected);

  useEffect(() => {
    setSelected(null);
    setPickerValue("");
    setFields(createInitialCommonFields(category, preferredCurrency));
    setLocalError(null);
  }, [category, preferredCurrency]);

  const purchasePriceError = fieldErrors?.purchasePriceMinor ?? fieldErrors?.purchasePrice;

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
        <label className="text-sm font-medium">Ингредиент из каталога</label>
        <IngredientPicker
          value={pickerValue}
          category={category}
          onValueChange={(nextValue) => {
            setPickerValue(nextValue);
            setLocalError(null);
            if (selected && nextValue.trim() !== selected.displayName) {
              setSelected(null);
              const resetProfile = resolveCatalogIngredientUnitProfile(category, null);
              setFields((current) => ({
                ...current,
                enteredUnit: resetProfile.allowedUnits.includes(current.enteredUnit)
                  ? current.enteredUnit
                  : resetProfile.defaultUnit,
                purchaseQuantityUnit: resetProfile.allowedUnits.includes(current.purchaseQuantityUnit)
                  ? current.purchaseQuantityUnit
                  : resetProfile.defaultUnit
              }));
            }
          }}
          onSelect={(item) => {
            setSelected(item);
            setPickerValue(item.displayName);
            setLocalError(null);
            const nextUnitProfile = resolveCatalogIngredientUnitProfile(category, item);
            setFields((current) => {
              return {
                ...current,
                enteredUnit: nextUnitProfile.defaultUnit,
                purchaseQuantityUnit: nextUnitProfile.allowedUnits.includes(current.purchaseQuantityUnit)
                  ? current.purchaseQuantityUnit
                  : nextUnitProfile.defaultUnit
              };
            });
          }}
          placeholder="Начните вводить название ингредиента"
          emptyCta={<button type="button" onClick={onRequestCustom} className="text-sm text-blue-700 underline">Не нашли? Добавить свой ингредиент</button>}
        />
        {selected ? (
          <p className="text-xs text-zinc-600">
            Выбрано: {selected.displayName}
            {selected.familyDisplayName ? ` · ${selected.familyDisplayName}` : ""}
            {selected.subtitle ? ` · ${selected.subtitle}` : ""}
          </p>
        ) : null}
        {(localError || fieldErrors?.ingredientCatalogItemId) && <p className="text-xs text-red-600">{localError ?? fieldErrors?.ingredientCatalogItemId}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Количество
          <input
            type="number"
            min="0"
            step="0.001"
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
          <input type="date" className="mt-1 w-full rounded-md border px-2 py-2" value={fields.purchasedAt} onChange={(e) => setFields((s) => ({ ...s, purchasedAt: e.target.value }))} />
        </label>
        <label className="text-sm">Годен до
          <input type="date" className="mt-1 w-full rounded-md border px-2 py-2" value={fields.freshnessDate} onChange={(e) => setFields((s) => ({ ...s, freshnessDate: e.target.value }))} />
        </label>
      </div>

      <details className="rounded-md border p-3" open={Boolean(fields.purchasePrice || fields.purchaseQuantity)}>
        <summary className="cursor-pointer text-sm font-medium">Стоимость покупки (опционально)</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-sm">Цена
            <input
              type="number"
              min="0"
              step="0.01"
              className="mt-1 w-full rounded-md border px-2 py-2"
              value={fields.purchasePrice}
              onChange={(e) => setFields((s) => ({ ...s, purchasePrice: e.target.value }))}
              inputMode="decimal"
            />
            {purchasePriceError && <span className="text-xs text-red-600">{purchasePriceError}</span>}
          </label>
          <label className="text-sm">Валюта
            <select
              className="mt-1 w-full rounded-md border px-2 py-2"
              value={fields.purchaseCurrency}
              onChange={(e) => setFields((s) => ({ ...s, purchaseCurrency: e.target.value as SystemCurrency }))}
            >
              <option value="RUB">RUB</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </label>
          <label className="text-sm">Куплено
            <input
              type="number"
              min="0"
              step="0.001"
              className="mt-1 w-full rounded-md border px-2 py-2"
              value={fields.purchaseQuantity}
              onChange={(e) => setFields((s) => ({ ...s, purchaseQuantity: e.target.value }))}
              inputMode="decimal"
            />
            {fieldErrors?.purchaseQuantity && <span className="text-xs text-red-600">{fieldErrors.purchaseQuantity}</span>}
          </label>
          <label className="text-sm">Ед. закупки
            <select
              className="mt-1 w-full rounded-md border px-2 py-2"
              value={fields.purchaseQuantityUnit}
              onChange={(e) => setFields((s) => ({ ...s, purchaseQuantityUnit: e.target.value as InventoryUnit }))}
            >
              {unitProfile.allowedUnits.map((unit) => <option key={unit} value={unit}>{inventoryUnitLabels[unit]}</option>)}
            </select>
          </label>
        </div>
      </details>

      <label className="block text-sm">Заметки
        <textarea className="mt-1 h-20 w-full rounded-md border px-2 py-2" value={fields.notes} onChange={(e) => setFields((s) => ({ ...s, notes: e.target.value }))} />
      </label>

      <button type="submit" disabled={pending} className="w-full rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60">
        {pending ? "Сохранение..." : "Добавить в запасы"}
      </button>
    </form>
  );
}
