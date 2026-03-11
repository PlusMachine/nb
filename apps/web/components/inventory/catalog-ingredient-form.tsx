"use client";

import React from "react";
import { useState } from "react";

import { IngredientPicker } from "@/components/ingredients/ingredient-picker";
import type { IngredientSuggestionItem, IngredientType } from "@/features/ingredients/contracts";

type InventoryCommonFields = {
  quantity: string;
  unit: string;
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
    quantity: string;
    unit: string;
    purchasedAt: string;
    freshnessDate: string;
    notes: string;
  }) => Promise<void>;
  onRequestCustom: () => void;
};

const initialCommon: InventoryCommonFields = {
  quantity: "",
  unit: "g",
  purchasedAt: "",
  freshnessDate: "",
  notes: ""
};

export function CatalogIngredientForm({ type, pending, fieldErrors, onSubmit, onRequestCustom }: Props) {
  const [selected, setSelected] = useState<IngredientSuggestionItem | null>(null);
  const [fields, setFields] = useState<InventoryCommonFields>(initialCommon);
  const [localError, setLocalError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!selected?.id) {
          setLocalError("Выберите ингредиент из каталога.");
          return;
        }
        setLocalError(null);
        await onSubmit({ ingredientCatalogItemId: selected.id, ...fields });
      }}
    >
      <div className="space-y-1">
        <label className="text-sm font-medium">Ингредиент из каталога</label>
        <IngredientPicker
          type={type}
          onSelect={(item) => setSelected(item)}
          placeholder="Начните вводить название ингредиента"
          emptyCta={<button type="button" onClick={onRequestCustom} className="text-sm text-blue-700 underline">Не нашли? Добавить свой ингредиент</button>}
        />
        {selected && <p className="text-xs text-zinc-600">Выбрано: {selected.displayName}</p>}
        {(localError || fieldErrors?.ingredientCatalogItemId) && <p className="text-xs text-red-600">{localError ?? fieldErrors?.ingredientCatalogItemId}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Количество
          <input className="mt-1 w-full rounded-md border px-2 py-2" value={fields.quantity} onChange={(e) => setFields((s) => ({ ...s, quantity: e.target.value }))} inputMode="numeric" />
          {fieldErrors?.quantity && <span className="text-xs text-red-600">{fieldErrors.quantity}</span>}
        </label>
        <label className="text-sm">Ед. изм.
          <input className="mt-1 w-full rounded-md border px-2 py-2" value={fields.unit} onChange={(e) => setFields((s) => ({ ...s, unit: e.target.value }))} />
          {fieldErrors?.unit && <span className="text-xs text-red-600">{fieldErrors.unit}</span>}
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
