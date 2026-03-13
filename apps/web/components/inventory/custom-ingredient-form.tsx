"use client";

import React from "react";
import { useEffect, useState } from "react";

import type { IngredientCategory, IngredientSubtype } from "@/features/ingredients/contracts";
import { formatIngredientSubtypeLabel } from "@/features/ingredients/presentation";
import { ingredientCategorySubtypes } from "@/features/ingredients/taxonomy";
import { inventoryUnitLabels, resolveInventoryUnitProfile, type InventoryUnit } from "@/features/inventory/units";
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
    purchasePrice: string;
    purchaseCurrency: SystemCurrency;
    purchaseQuantity: string;
    purchaseQuantityUnit: InventoryUnit;
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
    resolveInventoryUnitProfile({ category }).defaultUnit
  );
  const [enteredQuantity, setEnteredQuantity] = useState("");
  const [enteredUnit, setEnteredUnit] = useState<InventoryUnit>(resolveInventoryUnitProfile({ category }).defaultUnit);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [purchaseCurrency, setPurchaseCurrency] = useState<SystemCurrency>(preferredCurrency);
  const [purchaseQuantity, setPurchaseQuantity] = useState("");
  const [purchaseQuantityUnit, setPurchaseQuantityUnit] = useState<InventoryUnit>(resolveInventoryUnitProfile({ category }).defaultUnit);
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
    const nextDefaultUnit = resolveInventoryUnitProfile({ category }).defaultUnit;
    setSubtype("");
    setDefaultDisplayUnit(nextDefaultUnit);
    setEnteredUnit(nextDefaultUnit);
    setPurchaseCurrency(preferredCurrency);
    setPurchaseQuantityUnit(nextDefaultUnit);
  }, [category, preferredCurrency]);

  useEffect(() => {
    if (!unitProfile.allowedUnits.includes(defaultDisplayUnit)) {
      setDefaultDisplayUnit(unitProfile.defaultUnit);
    }

    if (!unitProfile.allowedUnits.includes(enteredUnit)) {
      setEnteredUnit(unitProfile.defaultUnit);
    }

    if (!unitProfile.allowedUnits.includes(purchaseQuantityUnit)) {
      setPurchaseQuantityUnit(unitProfile.defaultUnit);
    }
  }, [defaultDisplayUnit, enteredUnit, purchaseQuantityUnit, unitProfile]);

  const purchasePriceError = fieldErrors?.purchasePriceMinor ?? fieldErrors?.purchasePrice;

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
          purchasePrice,
          purchaseCurrency,
          purchaseQuantity,
          purchaseQuantityUnit,
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

      <details className="rounded-md border p-3" open={Boolean(purchasePrice || purchaseQuantity)}>
        <summary className="cursor-pointer text-sm font-medium">Стоимость покупки (опционально)</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-sm">Цена
            <input
              type="number"
              min="0"
              step="0.01"
              className="mt-1 w-full rounded-md border px-2 py-2"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              inputMode="decimal"
            />
            {purchasePriceError && <span className="text-xs text-red-600">{purchasePriceError}</span>}
          </label>
          <label className="text-sm">Валюта
            <select className="mt-1 w-full rounded-md border px-2 py-2" value={purchaseCurrency} onChange={(e) => setPurchaseCurrency(e.target.value as SystemCurrency)}>
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
              value={purchaseQuantity}
              onChange={(e) => setPurchaseQuantity(e.target.value)}
              inputMode="decimal"
            />
            {fieldErrors?.purchaseQuantity && <span className="text-xs text-red-600">{fieldErrors.purchaseQuantity}</span>}
          </label>
          <label className="text-sm">Ед. закупки
            <select className="mt-1 w-full rounded-md border px-2 py-2" value={purchaseQuantityUnit} onChange={(e) => setPurchaseQuantityUnit(e.target.value as InventoryUnit)}>
              {unitProfile.allowedUnits.map((unit) => <option key={unit} value={unit}>{inventoryUnitLabels[unit]}</option>)}
            </select>
          </label>
        </div>
      </details>

      <label className="block text-sm">Заметки
        <textarea className="mt-1 h-20 w-full rounded-md border px-2 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <button type="submit" disabled={pending} className="w-full rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60">
        {pending ? "Сохранение..." : "Создать и добавить в запасы"}
      </button>
    </form>
  );
}
