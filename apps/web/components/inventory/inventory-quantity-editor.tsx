"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";

import { updateInventoryInlineAction } from "@/app/(app)/app/ingredients/actions";
import type { InventoryListItemDto } from "@/features/inventory/contracts";
import {
  formatInventoryQuantityForDisplay,
  formatInventoryQuantityInputValue,
  resolveInventoryMeasurementForDisplay
} from "@/features/inventory/display";
import { getInventoryUnitInputStep, inventoryUnitLabels, resolveInventoryUnitProfile } from "@/features/inventory/units";

type Props = {
  item: InventoryListItemDto;
  compact?: boolean;
  onAction?: () => void;
  hideEditor?: boolean;
  showFinishedAction?: boolean;
  renderFinishedAction?: (args: {
    onClick: () => void;
    isPending: boolean;
  }) => React.ReactNode;
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

export function InventoryQuantityEditor({
  item,
  compact = false,
  onAction,
  hideEditor = false,
  showFinishedAction = true,
  renderFinishedAction
}: Props) {
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
  const showEquivalentHint = displayQuantity.includes("(");
  const isQuantityValid = isInventoryQuantityValueValid(quantity);
  const isDirty = isInventoryQuantityDraftDirty(quantity, unit, savedQuantity, savedUnit);
  const canMarkFinished = canMarkInventoryItemFinished(quantity);
  const quantityStep = getInventoryUnitInputStep(unit);

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
        onAction?.();
      }
    });
  };

  const handleMarkFinished = () => {
    setFeedback(null);
    submitChange("0", unit);
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
      className={hideEditor ? "" : "space-y-1.5"}
      onSubmit={(event) => {
        event.preventDefault();
        if (!isDirty || !isQuantityValid) {
          return;
        }

        submitChange(quantity, unit);
      }}
    >
      {!hideEditor ? (
        <>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min="0"
              step={quantityStep}
              value={quantity}
              onChange={(event) => {
                setQuantity(event.target.value);
                setFeedback(null);
              }}
              onKeyDown={handleKeyDown}
              className="w-[4.5rem] rounded-lg border border-zinc-200 px-2 py-1.5 text-right text-sm tabular-nums transition-colors focus:border-zinc-400 focus:outline-none"
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
              className="rounded-lg border border-zinc-200 py-1.5 pl-1.5 pr-6 text-sm transition-colors focus:border-zinc-400 focus:outline-none"
              aria-label="Единица измерения"
            >
              {unitOptions.map((option) => <option key={option} value={option}>{inventoryUnitLabels[option]}</option>)}
            </select>
          </div>
          {showEquivalentHint ? (
            <p className="text-right text-[11px] text-zinc-500">{displayQuantity}</p>
          ) : null}
          {isDirty ? (
            <div className="flex items-center gap-1.5">
              <button
                type="submit"
                disabled={isPending || !isQuantityValid}
                className="flex-1 rounded-lg bg-zinc-900 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60"
                aria-label="Сохранить количество"
              >
                OK
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={isPending}
                className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-50 disabled:opacity-60"
                aria-label="Отменить изменения количества"
              >
                ✕
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      {showFinishedAction && canMarkFinished && !isDirty ? (
        renderFinishedAction ? renderFinishedAction({
          onClick: handleMarkFinished,
          isPending
        }) : (
          <button
            type="button"
            disabled={isPending}
            onClick={handleMarkFinished}
            className="w-full rounded-lg bg-amber-50 py-1.5 text-center text-[11px] font-medium text-amber-700 ring-1 ring-amber-200 transition-colors hover:bg-amber-100 disabled:opacity-60"
          >
            {isPending ? "..." : "Закончился"}
          </button>
        )
      ) : null}
      {!isQuantityValid ? <p className="text-xs text-red-600">Ошибка</p> : null}
      {feedback ? <p className={`text-xs ${feedback.ok ? "text-emerald-700" : "text-red-600"}`}>{feedback.message}</p> : null}
    </form>
  );
}
