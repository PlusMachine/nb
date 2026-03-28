"use client";

import React from "react";
import { useEffect, useMemo, useState } from "react";

import { InventoryPriceInput } from "@/components/inventory/inventory-price-input";
import type { IngredientCategory, IngredientSubtype } from "@/features/ingredients/contracts";
import { formatIngredientSubtypeLabel } from "@/features/ingredients/presentation";
import { ingredientCategorySubtypes, resolveIngredientSubtype, resolveLegacyIngredientType } from "@/features/ingredients/taxonomy";
import {
  buildCustomIngredientTechnicalData,
  customYeastFormLabels,
  customYeastForms,
  normalizeCustomIngredientSubtype,
  resolveCustomIngredientUnitProfile,
  resolveDefaultCustomIngredientSubtype,
  shouldShowCustomIngredientSubtypeField,
  type CustomYeastForm
} from "@/features/inventory/custom-ingredient";
import type { InventoryPriceInputMode } from "@/features/inventory/purchase-cost";
import {
  inventoryUnitLabels,
  type InventoryUnit
} from "@/features/inventory/units";
import type { SystemCurrency } from "@/features/system/currency";
import { getTodayDateInputValue } from "./date-input";

type Props = {
  category: IngredientCategory;
  initialSubtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  preferredCurrency: SystemCurrency;
  pending: boolean;
  fieldErrors?: Record<string, string>;
  onSubmit: (payload: {
    type: string;
    category: IngredientCategory;
    subtype: string;
    displayName: string;
    brand: string;
    harvestYear: string;
    fermentableColorEbc: string;
    fermentableExtractYieldPct: string;
    hopAlphaAcidPct: string;
    yeastAttenuationPct: string;
    yeastForm: string;
    defaultDisplayUnit: InventoryUnit;
    enteredQuantity: string;
    enteredUnit: InventoryUnit;
    priceInputMode: InventoryPriceInputMode;
    priceInputAmount: string;
    purchasedAt: string;
    freshnessDate: string;
    notes: string;
  }) => Promise<void>;
};

const parseOptionalNumber = (value: string) => {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveSubtypeFieldLabel = (category: IngredientCategory) => (
  category === "fermentable" ? "Тип ферментируемого" : "Подтип"
);

export const getCustomIngredientSubtypeOptions = (category: IngredientCategory) => ingredientCategorySubtypes[category];

export function CustomIngredientForm({ category, initialSubtype = null, preferredCurrency, pending, fieldErrors, onSubmit }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [brand, setBrand] = useState("");
  const [subtype, setSubtype] = useState<string>(initialSubtype ?? resolveDefaultCustomIngredientSubtype(category) ?? "");
  const [fermentableColorEbc, setFermentableColorEbc] = useState("");
  const [fermentableExtractYieldPct, setFermentableExtractYieldPct] = useState("");
  const [hopAlphaAcidPct, setHopAlphaAcidPct] = useState("");
  const [harvestYear, setHarvestYear] = useState("");
  const [yeastAttenuationPct, setYeastAttenuationPct] = useState("");
  const [yeastForm, setYeastForm] = useState<CustomYeastForm>("dry");
  const [enteredQuantity, setEnteredQuantity] = useState("");
  const [priceInputMode, setPriceInputMode] = useState<InventoryPriceInputMode>("total");
  const [priceInputAmount, setPriceInputAmount] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(() => getTodayDateInputValue());
  const [freshnessDate, setFreshnessDate] = useState("");
  const [notes, setNotes] = useState("");

  const normalizedSubtype = useMemo(
    () => normalizeCustomIngredientSubtype(category, subtype),
    [category, subtype]
  );
  const resolvedType = useMemo(
    () => resolveLegacyIngredientType({ category, subtype: normalizedSubtype }),
    [category, normalizedSubtype]
  );
  const resolvedSubtype = useMemo(
    () => resolveIngredientSubtype({ type: resolvedType, category, subtype: normalizedSubtype }) as IngredientSubtype | null,
    [category, normalizedSubtype, resolvedType]
  );
  const technicalData = useMemo(() => buildCustomIngredientTechnicalData({
    type: resolvedType,
    fermentableColorEbc: parseOptionalNumber(fermentableColorEbc),
    fermentableExtractYieldPct: parseOptionalNumber(fermentableExtractYieldPct),
    hopAlphaAcidPct: parseOptionalNumber(hopAlphaAcidPct),
    yeastAttenuationPct: parseOptionalNumber(yeastAttenuationPct),
    yeastForm: category === "yeast" ? yeastForm : null
  }), [
    category,
    fermentableColorEbc,
    fermentableExtractYieldPct,
    hopAlphaAcidPct,
    resolvedType,
    yeastAttenuationPct,
    yeastForm
  ]);
  const unitProfile = useMemo(() => resolveCustomIngredientUnitProfile({
    type: resolvedType,
    category,
    subtype: resolvedSubtype,
    technicalData
  }), [category, resolvedSubtype, resolvedType, technicalData]);
  const [enteredUnit, setEnteredUnit] = useState<InventoryUnit>(unitProfile.defaultUnit);
  const subtypeOptions = shouldShowCustomIngredientSubtypeField(category)
    ? getCustomIngredientSubtypeOptions(category)
    : [];

  useEffect(() => {
    setSubtype(initialSubtype ?? resolveDefaultCustomIngredientSubtype(category) ?? "");
    setEnteredUnit(unitProfile.defaultUnit);
    setPriceInputMode("total");
    setHopAlphaAcidPct("");
    setHarvestYear("");
    setYeastAttenuationPct("");
    setFermentableColorEbc("");
    setFermentableExtractYieldPct("");

    if (category !== "yeast") {
      setYeastForm("dry");
    }
  }, [category, initialSubtype]);

  useEffect(() => {
    if (!unitProfile.allowedUnits.includes(enteredUnit)) {
      setEnteredUnit(unitProfile.defaultUnit);
    }
  }, [enteredUnit, unitProfile]);

  const purchasePriceError = fieldErrors?.priceInputAmountMinor ?? fieldErrors?.purchasePriceMinor ?? fieldErrors?.purchasePrice;

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit({
          type: resolvedType,
          category,
          subtype: normalizedSubtype ?? "",
          displayName,
          brand,
          harvestYear,
          fermentableColorEbc,
          fermentableExtractYieldPct,
          hopAlphaAcidPct,
          yeastAttenuationPct,
          yeastForm: category === "yeast" ? yeastForm : "",
          defaultDisplayUnit: unitProfile.defaultUnit,
          enteredQuantity,
          enteredUnit,
          priceInputMode,
          priceInputAmount,
          purchasedAt,
          freshnessDate,
          notes
        });
      }}
    >
      <div className="rounded-xl border border-zinc-200 p-4">
        <div className="mb-3">
          <h3 className="text-sm font-medium text-zinc-950">Параметры ингредиента</h3>
          <p className="mt-1 text-xs text-zinc-500">Показываем только те поля, которые реально нужны для выбранной категории.</p>
        </div>

        <div className="space-y-3">
          <label className="block text-sm">Название ингредиента
            <input
              className="mt-1 w-full rounded-md border px-2 py-2"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={
                category === "hop"
                  ? "Например: Хмель Cascade"
                  : category === "yeast"
                    ? "Например: US-05"
                    : "Например: Пшеничный солод"
              }
            />
            {fieldErrors?.displayName && <span className="text-xs text-red-600">{fieldErrors.displayName}</span>}
          </label>

          <label className="block text-sm">Бренд
            <input
              className="mt-1 w-full rounded-md border px-2 py-2"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Необязательно"
            />
            {fieldErrors?.brand && <span className="text-xs text-red-600">{fieldErrors.brand}</span>}
          </label>

          {shouldShowCustomIngredientSubtypeField(category) ? (
            <label className="block text-sm">{resolveSubtypeFieldLabel(category)}
              <select className="mt-1 w-full rounded-md border px-2 py-2" value={subtype} onChange={(e) => setSubtype(e.target.value)}>
                {subtypeOptions.map((option) => (
                  <option key={option} value={option}>{formatIngredientSubtypeLabel(category, option)}</option>
                ))}
              </select>
              {fieldErrors?.subtype && <span className="text-xs text-red-600">{fieldErrors.subtype}</span>}
            </label>
          ) : null}

          {category === "fermentable" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">Цвет, EBC
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className="mt-1 w-full rounded-md border px-2 py-2"
                  value={fermentableColorEbc}
                  onChange={(e) => setFermentableColorEbc(e.target.value)}
                  inputMode="decimal"
                />
                {fieldErrors?.fermentableColorEbc && <span className="text-xs text-red-600">{fieldErrors.fermentableColorEbc}</span>}
              </label>
              <label className="text-sm">Экстрактивность, %
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  className="mt-1 w-full rounded-md border px-2 py-2"
                  value={fermentableExtractYieldPct}
                  onChange={(e) => setFermentableExtractYieldPct(e.target.value)}
                  inputMode="decimal"
                />
                {fieldErrors?.fermentableExtractYieldPct && <span className="text-xs text-red-600">{fieldErrors.fermentableExtractYieldPct}</span>}
              </label>
            </div>
          ) : null}

          {category === "hop" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">Альфа-кислота, %
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  className="mt-1 w-full rounded-md border px-2 py-2"
                  value={hopAlphaAcidPct}
                  onChange={(e) => setHopAlphaAcidPct(e.target.value)}
                  inputMode="decimal"
                />
                {fieldErrors?.hopAlphaAcidPct && <span className="text-xs text-red-600">{fieldErrors.hopAlphaAcidPct}</span>}
              </label>
              <label className="text-sm">Год урожая
                <input
                  type="number"
                  min="1900"
                  max="2100"
                  step="1"
                  className="mt-1 w-full rounded-md border px-2 py-2"
                  value={harvestYear}
                  onChange={(e) => setHarvestYear(e.target.value)}
                  inputMode="numeric"
                  placeholder="Необязательно"
                />
                {fieldErrors?.harvestYear && <span className="text-xs text-red-600">{fieldErrors.harvestYear}</span>}
              </label>
            </div>
          ) : null}

          {category === "yeast" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">Тип дрожжей
                <select className="mt-1 w-full rounded-md border px-2 py-2" value={yeastForm} onChange={(e) => setYeastForm(e.target.value as CustomYeastForm)}>
                  {customYeastForms.map((option) => (
                    <option key={option} value={option}>{customYeastFormLabels[option]}</option>
                  ))}
                </select>
                {fieldErrors?.yeastForm && <span className="text-xs text-red-600">{fieldErrors.yeastForm}</span>}
              </label>
              <label className="text-sm">Аттенюация, %
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  className="mt-1 w-full rounded-md border px-2 py-2"
                  value={yeastAttenuationPct}
                  onChange={(e) => setYeastAttenuationPct(e.target.value)}
                  inputMode="decimal"
                />
                {fieldErrors?.yeastAttenuationPct && <span className="text-xs text-red-600">{fieldErrors.yeastAttenuationPct}</span>}
              </label>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 p-4">
        <div className="mb-3">
          <h3 className="text-sm font-medium text-zinc-950">Что добавить в запасы</h3>
          <p className="mt-1 text-xs text-zinc-500">Единица учета подбирается автоматически: для этой категории будет использоваться {inventoryUnitLabels[unitProfile.defaultUnit]}.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

          <label className="text-sm">Единица количества
            <select className="mt-1 w-full rounded-md border px-2 py-2" value={enteredUnit} onChange={(e) => setEnteredUnit(e.target.value as InventoryUnit)}>
              {unitProfile.allowedUnits.map((unit) => <option key={unit} value={unit}>{inventoryUnitLabels[unit]}</option>)}
            </select>
            {fieldErrors?.enteredUnit && <span className="text-xs text-red-600">{fieldErrors.enteredUnit}</span>}
          </label>

          <label className="text-sm">Дата покупки
            <div className="mt-1 flex items-center gap-2">
              <input
                type="date"
                className="w-full rounded-md border px-2 py-2"
                value={purchasedAt}
                onChange={(e) => setPurchasedAt(e.target.value)}
              />
              <button
                type="button"
                className="rounded-md border border-zinc-200 px-2 py-2 text-xs text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                onClick={() => setPurchasedAt("")}
                aria-label="Очистить дату покупки"
              >
                ×
              </button>
            </div>
          </label>

          <label className="text-sm">Годен до
            <input type="date" className="mt-1 w-full rounded-md border px-2 py-2" value={freshnessDate} onChange={(e) => setFreshnessDate(e.target.value)} />
          </label>
        </div>
      </div>

      <InventoryPriceInput
        preferredCurrency={preferredCurrency}
        priceInputMode={priceInputMode}
        priceInputAmount={priceInputAmount}
        enteredQuantity={enteredQuantity}
        enteredUnit={enteredUnit}
        fieldError={purchasePriceError}
        onPriceInputModeChange={setPriceInputMode}
        onPriceInputAmountChange={setPriceInputAmount}
        type={resolvedType}
        category={category}
        subtype={resolvedSubtype}
        defaultDisplayUnit={unitProfile.defaultUnit}
        allowedUnits={unitProfile.allowedUnits}
        measurementDimension={unitProfile.measurementDimension}
        technicalData={technicalData}
      />

      <label className="block text-sm">Заметки
        <textarea className="mt-1 h-20 w-full rounded-md border px-2 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <button type="submit" disabled={pending} className="w-full rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60">
        {pending ? "Сохранение..." : "Создать и добавить в запасы"}
      </button>
    </form>
  );
}
