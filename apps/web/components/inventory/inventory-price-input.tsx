"use client";

import React, { useMemo } from "react";

import type {
  IngredientCategory,
  IngredientSubtype,
  IngredientTechnicalData,
  IngredientType
} from "@/features/ingredients/contracts";
import {
  resolveInventoryHumanDisplayUnit,
  resolveInventoryMeasurementForDisplay
} from "@/features/inventory/display";
import {
  inventoryPriceInputModes,
  resolveInventoryPriceComputation,
  type InventoryPriceInputMode
} from "@/features/inventory/purchase-cost";
import {
  inventoryUnitShortLabels,
  normalizeInventoryMeasurementForProfile,
  resolveInventoryUnitProfile,
  type InventoryUnit
} from "@/features/inventory/units";
import {
  formatCurrencyMinor,
  formatUnitPriceMinor,
  parseMoneyInputToMinor
} from "@/features/system/money";
import type { SystemCurrency } from "@/features/system/currency";

type Props = {
  preferredCurrency: SystemCurrency;
  priceInputMode: InventoryPriceInputMode;
  priceInputAmount: string;
  enteredQuantity: string;
  enteredUnit: InventoryUnit;
  fieldError?: string;
  onPriceInputModeChange: (mode: InventoryPriceInputMode) => void;
  onPriceInputAmountChange: (value: string) => void;
  type?: IngredientType | null;
  category?: IngredientCategory | null;
  subtype?: IngredientSubtype | null;
  defaultDisplayUnit?: string | null;
  allowedUnits?: readonly string[] | null;
  measurementDimension?: string | null;
  technicalData?: IngredientTechnicalData | null;
};

const isPositiveNumber = (value: number) => Number.isFinite(value) && value > 0;

export function InventoryPriceInput({
  preferredCurrency,
  priceInputMode,
  priceInputAmount,
  enteredQuantity,
  enteredUnit,
  fieldError,
  onPriceInputModeChange,
  onPriceInputAmountChange,
  type,
  category,
  subtype,
  defaultDisplayUnit,
  allowedUnits,
  measurementDimension,
  technicalData
}: Props) {
  const unitProfile = useMemo(() => resolveInventoryUnitProfile({
    type,
    category,
    subtype,
    defaultDisplayUnit,
    allowedUnits,
    measurementDimension,
    technicalData: technicalData ?? null
  }), [allowedUnits, category, defaultDisplayUnit, measurementDimension, subtype, technicalData, type]);

  const practicalPriceUnit = useMemo(() => resolveInventoryHumanDisplayUnit({
    type,
    category,
    subtype,
    defaultDisplayUnit,
    allowedUnits,
    measurementDimension,
    technicalData: technicalData ?? null
  }), [allowedUnits, category, defaultDisplayUnit, measurementDimension, subtype, technicalData, type]);

  const displayMeasurement = useMemo(() => {
    const parsedQuantity = Number(enteredQuantity);

    if (!isPositiveNumber(parsedQuantity)) {
      return null;
    }

    try {
      const measurement = normalizeInventoryMeasurementForProfile(unitProfile, parsedQuantity, enteredUnit);
      return resolveInventoryMeasurementForDisplay({
        enteredQuantity: measurement.enteredQuantity,
        enteredUnit: measurement.enteredUnit,
        normalizedQuantity: measurement.normalizedQuantity,
        normalizedUnit: measurement.normalizedUnit,
        type,
        category,
        subtype,
        defaultDisplayUnit,
        allowedUnits,
        measurementDimension,
        technicalData: technicalData ?? null
      });
    } catch {
      return null;
    }
  }, [
    allowedUnits,
    category,
    defaultDisplayUnit,
    enteredQuantity,
    enteredUnit,
    measurementDimension,
    subtype,
    technicalData,
    type,
    unitProfile
  ]);

  const priceInputAmountMinor = parseMoneyInputToMinor(priceInputAmount);
  const pricePreview = useMemo(() => resolveInventoryPriceComputation({
    priceInputMode,
    priceInputAmountMinor,
    priceInputCurrency: preferredCurrency
  }, {
    defaultCurrency: preferredCurrency,
    displayMeasurement: displayMeasurement
      ? {
          quantity: displayMeasurement.quantity,
          unit: displayMeasurement.unit
        }
      : null
  }), [displayMeasurement, preferredCurrency, priceInputAmountMinor, priceInputMode]);
  const effectivePriceUnit = pricePreview.priceDisplayUnit ?? practicalPriceUnit;
  const helperText = priceInputAmountMinor == null
    ? "Цена сохранится в валюте профиля и автоматически привяжется к текущему количеству."
    : priceInputMode === "per_display_unit"
      ? (
          pricePreview.purchasePriceMinor != null
            ? `Итого: ${formatCurrencyMinor(pricePreview.purchasePriceMinor, preferredCurrency)}`
            : `Цена за ${inventoryUnitShortLabels[effectivePriceUnit]}`
        )
      : (
          pricePreview.perDisplayUnitPriceMinor != null
            ? `≈ ${formatUnitPriceMinor(
                pricePreview.perDisplayUnitPriceMinor,
                preferredCurrency,
                inventoryUnitShortLabels[effectivePriceUnit]
              )}`
            : "Цена относится ко всему количеству в карточке."
        );

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            Цена {priceInputMode === "per_display_unit" ? `за ${inventoryUnitShortLabels[effectivePriceUnit]}` : "за всё количество"}
          </p>
          <p className="text-xs text-zinc-500">Валюта по умолчанию: {preferredCurrency}</p>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-md bg-zinc-100 p-1 text-xs" role="group" aria-label="Режим цены">
          {inventoryPriceInputModes.map((mode) => {
            const active = priceInputMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onPriceInputModeChange(mode)}
                className={`rounded px-2 py-1.5 ${active ? "bg-white shadow" : "text-zinc-600"}`}
              >
                {mode === "total" ? "За всё" : "За единицу"}
              </button>
            );
          })}
        </div>
      </div>

      <label className="mt-3 block text-sm">
        Сумма
        <input
          type="number"
          min="0"
          step="0.01"
          className="mt-1 w-full rounded-md border px-2 py-2"
          value={priceInputAmount}
          onChange={(event) => onPriceInputAmountChange(event.target.value)}
          inputMode="decimal"
          placeholder={
            priceInputMode === "per_display_unit"
              ? `Например, 120 ${preferredCurrency} / ${inventoryUnitShortLabels[effectivePriceUnit]}`
              : `Например, 1250 ${preferredCurrency}`
          }
        />
        {fieldError ? <span className="text-xs text-red-600">{fieldError}</span> : null}
      </label>

      <p className="mt-2 text-xs text-zinc-500">{helperText}</p>
    </div>
  );
}
