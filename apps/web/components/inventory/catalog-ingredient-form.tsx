"use client";

import React from "react";
import { useEffect, useState } from "react";

import { IngredientPicker } from "@/components/ingredients/ingredient-picker";
import type { IngredientSuggestionItem, IngredientType } from "@/features/ingredients/contracts";
import {
  getDefaultInventoryUnit,
  getInventoryUnitOptions,
  inventoryUnitLabels,
  isUnitAllowedForIngredientType,
  parseInventoryUnit,
  type InventoryUnit
} from "@/features/inventory/units";

type InventoryCommonFields = {
  enteredQuantity: string;
  enteredUnit: InventoryUnit;
  purchasedAt: string;
  freshnessDate: string;
  notes: string;
};

type Props = {
  type: IngredientType;
  pending: boolean;
  fieldErrors?: Record<string, string>;
  onSubmit: (payload: {
    ingredientCatalogItemId: string;
    enteredQuantity: string;
    enteredUnit: InventoryUnit;
    purchasedAt: string;
    freshnessDate: string;
    notes: string;
  }) => Promise<void>;
  onRequestCustom: () => void;
};

const createInitialCommonFields = (type: IngredientType): InventoryCommonFields => ({
  enteredQuantity: "",
  enteredUnit: getDefaultInventoryUnit(type),
  purchasedAt: "",
  freshnessDate: "",
  notes: ""
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

export function CatalogIngredientForm({ type, pending, fieldErrors, onSubmit, onRequestCustom }: Props) {
  const [selected, setSelected] = useState<IngredientSuggestionItem | null>(null);
  const [pickerValue, setPickerValue] = useState("");
  const [fields, setFields] = useState<InventoryCommonFields>(() => createInitialCommonFields(type));
  const [localError, setLocalError] = useState<string | null>(null);
  const unitOptions = getInventoryUnitOptions(type);

  useEffect(() => {
    setSelected(null);
    setPickerValue("");
    setFields(createInitialCommonFields(type));
    setLocalError(null);
  }, [type]);

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
          type={type}
          onValueChange={(nextValue) => {
            setPickerValue(nextValue);
            setLocalError(null);
            if (selected && nextValue.trim() !== selected.displayName) {
              setSelected(null);
            }
          }}
          onSelect={(item) => {
            setSelected(item);
            setPickerValue(item.displayName);
            setLocalError(null);
            setFields((current) => {
              const defaultUnit = parseInventoryUnit(item.defaultUnit);
              const nextUnit = defaultUnit && isUnitAllowedForIngredientType(defaultUnit, type)
                ? defaultUnit
                : current.enteredUnit;

              return {
                ...current,
                enteredUnit: nextUnit
              };
            });
          }}
          placeholder="Начните вводить название ингредиента"
          emptyCta={<button type="button" onClick={onRequestCustom} className="text-sm text-blue-700 underline">Не нашли? Добавить свой ингредиент</button>}
        />
        {selected && <p className="text-xs text-zinc-600">Выбрано: {selected.displayName}</p>}
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
            {unitOptions.map((unit) => <option key={unit} value={unit}>{inventoryUnitLabels[unit]}</option>)}
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

      <label className="block text-sm">Заметки
        <textarea className="mt-1 h-20 w-full rounded-md border px-2 py-2" value={fields.notes} onChange={(e) => setFields((s) => ({ ...s, notes: e.target.value }))} />
      </label>

      <button type="submit" disabled={pending} className="w-full rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60">
        {pending ? "Сохранение..." : "Добавить в запасы"}
      </button>
    </form>
  );
}
