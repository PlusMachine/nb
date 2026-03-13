"use client";

import React from "react";
import { useEffect, useState } from "react";

import { InventoryPriceInput } from "@/components/inventory/inventory-price-input";
import type { IngredientCategory, IngredientSubtype } from "@/features/ingredients/contracts";
import { formatIngredientSubtypeLabel } from "@/features/ingredients/presentation";
import { ingredientCategorySubtypes } from "@/features/ingredients/taxonomy";
import type { InventoryPriceInputMode } from "@/features/inventory/purchase-cost";
import {
  inventoryUnitLabels,
  resolveHumanFacingInventoryUnitProfile,
  resolveInventoryUnitProfile,
  type InventoryUnit
} from "@/features/inventory/units";
import type { SystemCurrency } from "@/features/system/currency";

type Props = {
  category: IngredientCategory;
  preferredCurrency: SystemCurrency;
  pending: boolean;
  fieldErrors?: Record<string, string>;
  onSubmit: (payload: {
    category: IngredientCategory;
    subtype: string;
    displayName: string;
    defaultDisplayUnit: InventoryUnit;
    enteredQuantity: string;
    enteredUnit: InventoryUnit;
    priceInputMode: InventoryPriceInputMode;
    priceInputAmount: string;
    purchasedAt: string;
    freshnessDate: string;
    notes: string;
  }) => Promise<void>;
};

export const getCustomIngredientSubtypeOptions = (category: IngredientCategory) => ingredientCategorySubtypes[category];

export function CustomIngredientForm({ category, preferredCurrency, pending, fieldErrors, onSubmit }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [subtype, setSubtype] = useState<string>("");
  const [defaultDisplayUnit, setDefaultDisplayUnit] = useState<InventoryUnit>(
    resolveHumanFacingInventoryUnitProfile({ category }).defaultUnit
  );
  const [enteredQuantity, setEnteredQuantity] = useState("");
  const [enteredUnit, setEnteredUnit] = useState<InventoryUnit>(resolveHumanFacingInventoryUnitProfile({ category }).defaultUnit);
  const [priceInputMode, setPriceInputMode] = useState<InventoryPriceInputMode>("total");
  const [priceInputAmount, setPriceInputAmount] = useState("");
  const [purchasedAt, setPurchasedAt] = useState("");
  const [freshnessDate, setFreshnessDate] = useState("");
  const [notes, setNotes] = useState("");
  const subtypeOptions = getCustomIngredientSubtypeOptions(category);
  const unitProfile = resolveInventoryUnitProfile({
    category,
    subtype: (subtype || null) as IngredientSubtype | null,
    defaultDisplayUnit
  });

  useEffect(() => {
    const nextDefaultUnit = resolveHumanFacingInventoryUnitProfile({ category }).defaultUnit;
    setSubtype("");
    setDefaultDisplayUnit(nextDefaultUnit);
    setEnteredUnit(nextDefaultUnit);
    setPriceInputMode("total");
  }, [category]);

  useEffect(() => {
    if (!unitProfile.allowedUnits.includes(defaultDisplayUnit)) {
      setDefaultDisplayUnit(unitProfile.defaultUnit);
    }

    if (!unitProfile.allowedUnits.includes(enteredUnit)) {
      setEnteredUnit(unitProfile.defaultUnit);
    }
  }, [defaultDisplayUnit, enteredUnit, unitProfile]);

  const purchasePriceError = fieldErrors?.priceInputAmountMinor ?? fieldErrors?.purchasePriceMinor ?? fieldErrors?.purchasePrice;

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit({
          category,
          subtype,
          displayName,
          defaultDisplayUnit,
          enteredQuantity,
          enteredUnit,
          priceInputMode,
          priceInputAmount,
          purchasedAt,
          freshnessDate,
          notes
        });
      }}
    >
      <label className="block text-sm">Название ингредиента
        <input className="mt-1 w-full rounded-md border px-2 py-2" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Например: Хмель Cascade из локального магазина" />
        {fieldErrors?.displayName && <span className="text-xs text-red-600">{fieldErrors.displayName}</span>}
      </label>

      <label className="block text-sm">Подтип
        <select className="mt-1 w-full rounded-md border px-2 py-2" value={subtype} onChange={(e) => setSubtype(e.target.value)}>
          <option value="">Без уточнения</option>
          {subtypeOptions.map((option) => (
            <option key={option} value={option}>{formatIngredientSubtypeLabel(category, option)}</option>
          ))}
        </select>
        {fieldErrors?.subtype && <span className="text-xs text-red-600">{fieldErrors.subtype}</span>}
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Базовая ед. изм.
          <select className="mt-1 w-full rounded-md border px-2 py-2" value={defaultDisplayUnit} onChange={(e) => setDefaultDisplayUnit(e.target.value as InventoryUnit)}>
            {unitProfile.allowedUnits.map((unit) => <option key={unit} value={unit}>{inventoryUnitLabels[unit]}</option>)}
          </select>
          {fieldErrors?.defaultDisplayUnit && <span className="text-xs text-red-600">{fieldErrors.defaultDisplayUnit}</span>}
        </label>
        <label className="text-sm">Количество
          <input
            type="number"
            min="0"
            step="0.001"
            className="mt-1 w-full rounded-md border px-2 py-2"
            value={enteredQuantity}
            onChange={(e) => setEnteredQuantity(e.target.value)}
            inputMode="decimal"
          />
          {fieldErrors?.enteredQuantity && <span className="text-xs text-red-600">{fieldErrors.enteredQuantity}</span>}
        </label>
        <label className="text-sm">Ед. изм.
          <select className="mt-1 w-full rounded-md border px-2 py-2" value={enteredUnit} onChange={(e) => setEnteredUnit(e.target.value as InventoryUnit)}>
            {unitProfile.allowedUnits.map((unit) => <option key={unit} value={unit}>{inventoryUnitLabels[unit]}</option>)}
          </select>
          {fieldErrors?.enteredUnit && <span className="text-xs text-red-600">{fieldErrors.enteredUnit}</span>}
        </label>
        <label className="text-sm">Дата покупки
          <input type="date" className="mt-1 w-full rounded-md border px-2 py-2" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} />
        </label>
        <label className="text-sm">Годен до
          <input type="date" className="mt-1 w-full rounded-md border px-2 py-2" value={freshnessDate} onChange={(e) => setFreshnessDate(e.target.value)} />
        </label>
      </div>

      <InventoryPriceInput
        preferredCurrency={preferredCurrency}
        priceInputMode={priceInputMode}
        priceInputAmount={priceInputAmount}
        enteredQuantity={enteredQuantity}
        enteredUnit={enteredUnit}
        fieldError={purchasePriceError}
        onPriceInputModeChange={setPriceInputMode}
        onPriceInputAmountChange={setPriceInputAmount}
        category={category}
        subtype={(subtype || null) as IngredientSubtype | null}
        defaultDisplayUnit={defaultDisplayUnit}
      />

      <label className="block text-sm">Заметки
        <textarea className="mt-1 h-20 w-full rounded-md border px-2 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <button type="submit" disabled={pending} className="w-full rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60">
        {pending ? "Сохранение..." : "Создать и добавить в запасы"}
      </button>
    </form>
  );
}
