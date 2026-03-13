"use client";

import React, { useMemo, useState, useTransition } from "react";

import { updateInventoryInlineAction } from "@/app/(app)/app/ingredients/actions";
import type { InventoryListItemDto } from "@/features/inventory/contracts";
import { formatInventoryQuantityForDisplay } from "@/features/inventory/display";
import { inventoryUnitLabels, resolveInventoryUnitProfile } from "@/features/inventory/units";

type Props = {
  item: InventoryListItemDto;
};

export function InventoryQuantityEditor({ item }: Props) {
  const [editing, setEditing] = useState(false);
  const [quantity, setQuantity] = useState(String(item.enteredQuantity));
  const [unit, setUnit] = useState(item.enteredUnit);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const unitOptions = useMemo(() => resolveInventoryUnitProfile({
    type: item.source.type,
    category: item.source.category,
    subtype: item.source.subtype,
    defaultDisplayUnit: item.source.defaultDisplayUnit,
    allowedUnits: item.source.allowedUnits,
    measurementDimension: item.source.measurementDimension,
    technicalData: item.source.technicalData
  }).allowedUnits, [item.source]);
  const displayQuantity = useMemo(() => formatInventoryQuantityForDisplay({
    enteredQuantity: item.enteredQuantity,
    enteredUnit: item.enteredUnit,
    normalizedQuantity: item.normalizedQuantity,
    normalizedUnit: item.normalizedUnit,
    type: item.source.type,
    category: item.source.category,
    subtype: item.source.subtype,
    defaultDisplayUnit: item.source.defaultDisplayUnit,
    allowedUnits: item.source.allowedUnits,
    measurementDimension: item.source.measurementDimension,
    technicalData: item.source.technicalData
  }), [item]);
  const rawQuantity = `${item.enteredQuantity} ${item.enteredUnit}`;

  const reset = () => {
    setQuantity(String(item.enteredQuantity));
    setUnit(item.enteredUnit);
    setEditing(false);
    setFeedback(null);
  };

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <p className="text-sm font-medium">{displayQuantity}</p>
          {displayQuantity !== rawQuantity ? <p className="text-xs text-zinc-500">Ввод: {rawQuantity}</p> : null}
        </div>
        <button type="button" onClick={() => setEditing(true)} className="rounded border px-2 py-1 text-xs">Быстро изменить</button>
        {feedback ? <p className={`text-xs ${feedback.ok ? "text-emerald-700" : "text-red-600"}`}>{feedback.message}</p> : null}
      </div>
    );
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await updateInventoryInlineAction({
            inventoryItemId: item.id,
            enteredQuantity: quantity,
            enteredUnit: unit
          });
          setFeedback({ ok: result.ok, message: result.message });
          if (result.ok) {
            setEditing(false);
          }
        });
      }}
    >
      <input
        type="number"
        min="0"
        step="0.001"
        value={quantity}
        onChange={(event) => setQuantity(event.target.value)}
        className="w-24 rounded border px-2 py-1 text-sm"
        inputMode="decimal"
      />
      <select value={unit} onChange={(event) => setUnit(event.target.value as typeof unit)} className="rounded border px-2 py-1 text-sm">
        {unitOptions.map((option) => <option key={option} value={option}>{inventoryUnitLabels[option]}</option>)}
      </select>
      <button type="submit" disabled={isPending} className="rounded bg-black px-2 py-1 text-xs text-white disabled:opacity-60">{isPending ? "..." : "Сохранить"}</button>
      <button type="button" onClick={reset} className="rounded border px-2 py-1 text-xs">Отмена</button>
      {feedback ? <p className={`basis-full text-xs ${feedback.ok ? "text-emerald-700" : "text-red-600"}`}>{feedback.message}</p> : null}
    </form>
  );
}
