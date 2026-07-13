"use client";

import React, { useMemo } from "react";

import { NumericInput } from "@/components/shared/numeric-input";
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
  currencySymbol,
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
    ? null
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
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-xs" role="group" aria-label="Режим цены">
          {inventoryPriceInputModes.map((mode) => {
            const active = priceInputMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onPriceInputModeChange(mode)}
                className={`rounded px-2 py-1.5 ${active ? "bg-card shadow" : "text-muted-foreground"}`}
              >
                {mode === "total" ? "За всё" : "За единицу"}
              </button>
            );
          })}
        </div>
      </div>

      <label className="mt-3 block text-sm">
        Сумма
        <NumericInput
          min={0}
          step="0.01"
          className="mt-1 w-full rounded-md border px-2 py-2 text-base sm:text-sm"
          value={priceInputAmount}
          onChange={(event) => onPriceInputAmountChange(event.target.value)}
          placeholder={
            priceInputMode === "per_display_unit"
              ? `Например, 120 ${currencySymbol(preferredCurrency)} / ${inventoryUnitShortLabels[effectivePriceUnit]}`
              : `Например, 1250 ${currencySymbol(preferredCurrency)}`
          }
        />
        {fieldError ? <span className="text-xs text-destructive">{fieldError}</span> : null}
      </label>

      {helperText ? <p className="mt-2 text-xs text-muted-foreground">{helperText}</p> : null}
    </div>
  );
}
