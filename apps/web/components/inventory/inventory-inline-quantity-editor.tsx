"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { updateInventoryInlineAction } from "@/app/(app)/app/ingredients/actions";
import type { InventoryListItemDto } from "@/features/inventory/contracts";
import { buildInventoryDisplayInput } from "@/features/inventory/consume";
import {
  formatInventoryQuantityForDisplay,
  formatInventoryQuantityInputValue,
  resolveInventoryMeasurementForDisplay
} from "@/features/inventory/display";
import { resolveInventoryPackEquivalent } from "@/features/inventory/pack";
import {
  getInventoryUnitInputStep,
  inventoryUnitLabels,
  resolveInventoryUnitProfile,
  type InventoryUnit
} from "@/features/inventory/units";

import { isInventoryQuantityValueValid } from "./inventory-quantity-editor";

type Props = {
  item: InventoryListItemDto;
  onAction?: () => void;
};

/**
 * Click-to-edit inline editor for the remaining quantity. Shows the amount as
 * plain text; tapping turns it into an in-place input + unit selector. Enter / ✓
 * saves the new absolute remaining, Esc / ✕ cancels. Used for quick corrections
 * ("actually it's 5 kg, not 15") without leaving the card.
 */
export function InventoryInlineQuantityEditor({ item, onAction }: Props) {
  const displayMeasurement = useMemo(
    () => resolveInventoryMeasurementForDisplay(buildInventoryDisplayInput(item)),
    [item]
  );
  const displayLabel = useMemo(
    () => formatInventoryQuantityForDisplay(buildInventoryDisplayInput(item)),
    [item]
  );
  const unitOptions = useMemo(() => resolveInventoryUnitProfile({
    type: item.source.type,
    category: item.source.category,
    subtype: item.source.subtype,
    defaultDisplayUnit: item.source.defaultDisplayUnit,
    allowedUnits: item.source.allowedUnits,
    measurementDimension: item.source.measurementDimension,
    technicalData: item.source.technicalData
  }).allowedUnits, [item.source]);
  const packEquivalent = useMemo(
    () => resolveInventoryPackEquivalent(item.source.technicalData),
    [item.source.technicalData]
  );

  const initialQuantity = formatInventoryQuantityInputValue(displayMeasurement.quantity, displayMeasurement.unit);
  const initialUnit = displayMeasurement.unit;

  const [editing, setEditing] = useState(false);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [unit, setUnit] = useState<InventoryUnit>(initialUnit);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isEmpty = item.normalizedQuantity <= 0;

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const getUnitLabel = (option: InventoryUnit) => {
    if (option !== "pack" || !packEquivalent) {
      return inventoryUnitLabels[option];
    }

    return `пачка ${formatInventoryQuantityInputValue(packEquivalent.normalizedQuantity, packEquivalent.normalizedUnit)}${packEquivalent.normalizedUnit}`;
  };

  const startEditing = () => {
    setQuantity(initialQuantity);
    setUnit(initialUnit);
    setFeedback(null);
    setEditing(true);
  };

  const cancel = () => {
    setQuantity(initialQuantity);
    setUnit(initialUnit);
    setFeedback(null);
    setEditing(false);
  };

  const isValid = isInventoryQuantityValueValid(quantity);
  const isDirty = quantity !== initialQuantity || unit !== initialUnit;

  const submit = () => {
    if (!isValid) {
      return;
    }

    if (!isDirty) {
      setEditing(false);
      return;
    }

    startTransition(async () => {
      const result = await updateInventoryInlineAction({
        inventoryItemId: item.id,
        enteredQuantity: quantity,
        enteredUnit: unit
      });

      if (result.ok) {
        setEditing(false);
        setFeedback(null);
        onAction?.();
        return;
      }

      setFeedback(result.message);
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  };

  // Commit on focus leaving the editor entirely; ignore focus moving to the unit
  // selector or the confirm/cancel buttons inside the editor.
  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (isPending) {
      return;
    }

    const nextFocus = event.relatedTarget as Node | null;
    if (nextFocus && containerRef.current?.contains(nextFocus)) {
      return;
    }

    if (isValid) {
      submit();
    } else {
      cancel();
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEditing}
        aria-label="Изменить количество"
        className={`rounded-lg px-1 text-base font-semibold tabular-nums transition-colors hover:bg-zinc-100 ${
          isEmpty ? "text-sm font-medium text-rose-400 hover:text-rose-500" : "text-zinc-900"
        }`}
      >
        {isEmpty ? "закончился" : displayLabel}
      </button>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col items-end gap-1" onBlur={handleBlur}>
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="number"
          min="0"
          step={getInventoryUnitInputStep(unit)}
          value={quantity}
          onChange={(event) => {
            setQuantity(event.target.value);
            setFeedback(null);
          }}
          onKeyDown={handleKeyDown}
          className="w-[4.5rem] rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-right text-sm tabular-nums transition-colors focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
          inputMode="decimal"
          aria-label="Новый остаток"
        />
        <select
          value={unit}
          onChange={(event) => {
            setUnit(event.target.value as InventoryUnit);
            setFeedback(null);
          }}
          onKeyDown={handleKeyDown}
          className="rounded-lg border border-zinc-200 bg-white py-1.5 pl-1.5 pr-6 text-sm transition-colors focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
          aria-label="Единица измерения"
        >
          {unitOptions.map((option) => <option key={option} value={option}>{getUnitLabel(option)}</option>)}
        </select>
        <button
          type="button"
          onClick={submit}
          disabled={isPending || !isValid}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
          aria-label="Сохранить количество"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={isPending}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 text-zinc-400 transition-colors hover:bg-zinc-50 hover:text-zinc-600 disabled:opacity-50"
          aria-label="Отменить изменение количества"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
      {feedback ? <p role="alert" className="text-xs text-red-600">{feedback}</p> : null}
    </div>
  );
}
