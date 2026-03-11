"use client";

import React from "react";
import { useEffect, useState } from "react";

import type { IngredientType } from "@/features/ingredients/contracts";
import { getDefaultInventoryUnit, getInventoryUnitOptions, inventoryUnitLabels, type InventoryUnit } from "@/features/inventory/units";

type Props = {
  type: IngredientType;
  pending: boolean;
  fieldErrors?: Record<string, string>;
  onSubmit: (payload: {
    type: IngredientType;
    displayName: string;
    enteredQuantity: string;
    enteredUnit: InventoryUnit;
    purchasedAt: string;
    freshnessDate: string;
    notes: string;
  }) => Promise<void>;
};

export function CustomIngredientForm({ type, pending, fieldErrors, onSubmit }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [enteredQuantity, setEnteredQuantity] = useState("");
  const [enteredUnit, setEnteredUnit] = useState<InventoryUnit>(getDefaultInventoryUnit(type));
  const [purchasedAt, setPurchasedAt] = useState("");
  const [freshnessDate, setFreshnessDate] = useState("");
  const [notes, setNotes] = useState("");
  const unitOptions = getInventoryUnitOptions(type);

  useEffect(() => {
    setEnteredUnit(getDefaultInventoryUnit(type));
  }, [type]);

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit({ type, displayName, enteredQuantity, enteredUnit, purchasedAt, freshnessDate, notes });
      }}
    >
      <label className="block text-sm">Название ингредиента
        <input className="mt-1 w-full rounded-md border px-2 py-2" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Например: Хмель Cascade из локального магазина" />
        {fieldErrors?.displayName && <span className="text-xs text-red-600">{fieldErrors.displayName}</span>}
      </label>

      <div className="grid grid-cols-2 gap-3">
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
            {unitOptions.map((unit) => <option key={unit} value={unit}>{inventoryUnitLabels[unit]}</option>)}
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

      <label className="block text-sm">Заметки
        <textarea className="mt-1 h-20 w-full rounded-md border px-2 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <button type="submit" disabled={pending} className="w-full rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60">
        {pending ? "Сохранение..." : "Создать и добавить в запасы"}
      </button>
    </form>
  );
}
