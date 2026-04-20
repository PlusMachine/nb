"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";

import { updateInventoryInlineAction } from "@/app/(app)/app/ingredients/actions";
import type { InventoryListItemDto } from "@/features/inventory/contracts";
import {
  formatInventoryQuantityForDisplay,
  formatInventoryQuantityInputValue,
  resolveInventoryMeasurementForDisplay
} from "@/features/inventory/display";
import { resolveInventoryPackEquivalent } from "@/features/inventory/pack";
import { getInventoryUnitInputStep, inventoryUnitLabels, resolveInventoryUnitProfile } from "@/features/inventory/units";

type Props = {
  item: InventoryListItemDto;
  compact?: boolean;
  onAction?: () => void;
  hideEditor?: boolean;
  showFinishedAction?: boolean;
  showEquivalentHint?: boolean;
  renderFinishedAction?: (args: {
    onClick: () => void;
    isPending: boolean;
  }) => React.ReactNode;
};

const formatDirtyQuantityValue = (value: string, unit: InventoryListItemDto["enteredUnit"]) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? formatInventoryQuantityInputValue(parsed, unit) : value;
};

export const inventoryFinishedActionLabel = "обнулить остаток";
export const inventoryFinishedActionInlineClassName = "inline-flex h-8 items-center rounded-lg px-2 text-xs font-medium leading-none text-zinc-400 opacity-0 transition-all group-hover:opacity-100 hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-60";
export const inventoryFinishedActionBlockClassName = "w-full py-2 text-center text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-600 disabled:opacity-60";

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
  showEquivalentHint = true,
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
  const initialQuantity = formatInventoryQuantityInputValue(displayMeasurement.quantity, displayMeasurement.unit);
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
  const shouldShowEquivalentHint = showEquivalentHint && displayQuantity.includes("(");
  const isQuantityValid = isInventoryQuantityValueValid(quantity);
  const isDirty = isInventoryQuantityDraftDirty(quantity, unit, savedQuantity, savedUnit);
  const canMarkFinished = canMarkInventoryItemFinished(quantity);
  const quantityStep = getInventoryUnitInputStep(unit);
  const packEquivalent = useMemo(
    () => resolveInventoryPackEquivalent(item.source.technicalData),
    [item.source.technicalData]
  );
  const getUnitLabel = (option: typeof unit) => {
    if (option !== "pack" || !packEquivalent) {
      return inventoryUnitLabels[option];
    }

    return `пачка ${formatInventoryQuantityInputValue(packEquivalent.normalizedQuantity, packEquivalent.normalizedUnit)}${packEquivalent.normalizedUnit}`;
  };

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
        const formattedQuantity = formatDirtyQuantityValue(nextQuantity, nextUnit);
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
              className="w-[5rem] rounded-xl border border-zinc-200 bg-white px-2.5 py-2 text-right text-sm tabular-nums transition-all focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
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
              className="rounded-xl border border-zinc-200 bg-white py-2 pl-2 pr-7 text-sm transition-all focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
              aria-label="Единица измерения"
            >
              {unitOptions.map((option) => <option key={option} value={option}>{getUnitLabel(option)}</option>)}
            </select>
          </div>
          {shouldShowEquivalentHint ? (
            <p className="text-right text-xs text-zinc-400">{displayQuantity}</p>
          ) : null}
          {isDirty ? (
            <div className="flex items-center gap-1.5">
              <button
                type="submit"
                disabled={isPending || !isQuantityValid}
                className="flex-1 rounded-xl bg-zinc-900 py-2 text-xs font-semibold text-white transition-all hover:bg-zinc-800 active:scale-[0.97] disabled:opacity-50"
                aria-label="Сохранить количество"
              >
                {isPending ? "..." : "OK"}
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={isPending}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-50 disabled:opacity-50"
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
            className={inventoryFinishedActionBlockClassName}
          >
            {isPending ? "..." : inventoryFinishedActionLabel}
          </button>
        )
      ) : null}
      {!isQuantityValid ? <p className="text-xs text-red-600">Ошибка</p> : null}
      {feedback ? <p className={`text-xs ${feedback.ok ? "text-emerald-700" : "text-red-600"}`}>{feedback.message}</p> : null}
    </form>
  );
}
