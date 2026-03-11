"use client";

import React from "react";
import { useState } from "react";

import type { IngredientType } from "@/features/ingredients/contracts";

type Props = {
  type: IngredientType;
  pending: boolean;
  fieldErrors?: Record<string, string>;
  onSubmit: (payload: {
    type: IngredientType;
    displayName: string;
    quantity: string;
    unit: string;
    purchasedAt: string;
    freshnessDate: string;
    notes: string;
  }) => Promise<void>;
};

export function CustomIngredientForm({ type, pending, fieldErrors, onSubmit }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("g");
  const [purchasedAt, setPurchasedAt] = useState("");
  const [freshnessDate, setFreshnessDate] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit({ type, displayName, quantity, unit, purchasedAt, freshnessDate, notes });
      }}
    >
      <label className="block text-sm">Название ингредиента
        <input className="mt-1 w-full rounded-md border px-2 py-2" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Например: Хмель Cascade из локального магазина" />
        {fieldErrors?.displayName && <span className="text-xs text-red-600">{fieldErrors.displayName}</span>}
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Количество
          <input className="mt-1 w-full rounded-md border px-2 py-2" value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric" />
          {fieldErrors?.quantity && <span className="text-xs text-red-600">{fieldErrors.quantity}</span>}
        </label>
        <label className="text-sm">Ед. изм.
          <input className="mt-1 w-full rounded-md border px-2 py-2" value={unit} onChange={(e) => setUnit(e.target.value)} />
          {fieldErrors?.unit && <span className="text-xs text-red-600">{fieldErrors.unit}</span>}
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
