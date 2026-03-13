"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";

import { updateInventoryInlineAction } from "@/app/(app)/app/ingredients/actions";
import type { InventoryListItemDto } from "@/features/inventory/contracts";
import {
  formatInventoryQuantityForDisplay,
  formatInventoryQuantityInputValue,
  resolveInventoryMeasurementForDisplay
} from "@/features/inventory/display";
import { inventoryUnitLabels, resolveInventoryUnitProfile } from "@/features/inventory/units";

type Props = {
  item: InventoryListItemDto;
};

const formatDirtyQuantityValue = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? formatInventoryQuantityInputValue(parsed) : value;
};

export const isInventoryQuantityDraftDirty = (
  quantity: string,
  unit: string,
  savedQuantity: string,
  savedUnit: string
) => quantity !== savedQuantity || unit !== savedUnit;

export const isInventoryQuantityValueValid = (quantity: string) => {
  const parsed = Number(quantity);
  return Number.isFinite(parsed) && parsed >= 0;
};

export const canMarkInventoryItemFinished = (quantity: string) => {
  const parsed = Number(quantity);
  return Number.isFinite(parsed) && parsed > 0;
};

export function InventoryQuantityEditor({ item }: Props) {
  const displayMeasurement = useMemo(() => resolveInventoryMeasurementForDisplay({
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
  const initialQuantity = formatInventoryQuantityInputValue(displayMeasurement.quantity);
  const initialUnit = displayMeasurement.unit;
  const [quantity, setQuantity] = useState(initialQuantity);
  const [unit, setUnit] = useState(initialUnit);
  const [savedQuantity, setSavedQuantity] = useState(initialQuantity);
  const [savedUnit, setSavedUnit] = useState(initialUnit);
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
  const isQuantityValid = isInventoryQuantityValueValid(quantity);
  const isDirty = isInventoryQuantityDraftDirty(quantity, unit, savedQuantity, savedUnit);
  const canMarkFinished = canMarkInventoryItemFinished(quantity);

  useEffect(() => {
    setQuantity(initialQuantity);
    setUnit(initialUnit);
    setSavedQuantity(initialQuantity);
    setSavedUnit(initialUnit);
    setFeedback(null);
  }, [initialQuantity, initialUnit]);

  const reset = () => {
    setQuantity(savedQuantity);
    setUnit(savedUnit);
    setFeedback(null);
  };

  const submitChange = (nextQuantity: string, nextUnit: typeof unit) => {
    startTransition(async () => {
      const result = await updateInventoryInlineAction({
        inventoryItemId: item.id,
        enteredQuantity: nextQuantity,
        enteredUnit: nextUnit
      });

      setFeedback({ ok: result.ok, message: result.message });
      if (result.ok) {
        const formattedQuantity = formatDirtyQuantityValue(nextQuantity);
        setQuantity(formattedQuantity);
        setSavedQuantity(formattedQuantity);
        setUnit(nextUnit);
        setSavedUnit(nextUnit);
      }
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      reset();
      return;
    }

    if (event.key === "Enter" && isDirty && isQuantityValid) {
      event.preventDefault();
      submitChange(quantity, unit);
    }
  };

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!isDirty || !isQuantityValid) {
          return;
        }

        submitChange(quantity, unit);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min="0"
          step="0.001"
          value={quantity}
          onChange={(event) => {
            setQuantity(event.target.value);
            setFeedback(null);
          }}
          onKeyDown={handleKeyDown}
          className="w-24 rounded border px-2 py-1 text-sm"
          inputMode="decimal"
          aria-label="Количество"
        />
        <select
          value={unit}
          onChange={(event) => {
            setUnit(event.target.value as typeof unit);
            setFeedback(null);
          }}
          onKeyDown={handleKeyDown}
          className="rounded border px-2 py-1 text-sm"
          aria-label="Единица измерения"
        >
          {unitOptions.map((option) => <option key={option} value={option}>{inventoryUnitLabels[option]}</option>)}
        </select>
        {isDirty ? (
          <>
            <button
              type="submit"
              disabled={isPending || !isQuantityValid}
              className="rounded bg-black px-2 py-1 text-xs text-white disabled:opacity-60"
              aria-label="Сохранить количество"
            >
              ✓
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={isPending}
              className="rounded border px-2 py-1 text-xs disabled:opacity-60"
              aria-label="Отменить изменения количества"
            >
              ✕
            </button>
          </>
        ) : null}
        {canMarkFinished ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setFeedback(null);
              submitChange("0", unit);
            }}
            className="rounded border border-amber-300 px-2 py-1 text-xs text-amber-800 disabled:opacity-60"
          >
            {isPending ? "..." : "Закончился"}
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <span>Сейчас: {displayQuantity}</span>
        {displayQuantity !== rawQuantity ? <span>Ввод: {rawQuantity}</span> : null}
      </div>
      {!isQuantityValid ? <p className="text-xs text-red-600">Количество не может быть отрицательным.</p> : null}
      {feedback ? <p className={`text-xs ${feedback.ok ? "text-emerald-700" : "text-red-600"}`}>{feedback.message}</p> : null}
    </form>
  );
}
