"use client";

import React from "react";
import { useEffect, useMemo, useState, useTransition } from "react";

import { updateInventoryItemAction, type AddIngredientResult } from "@/app/(app)/app/ingredients/actions";
import { IngredientCategorySelector } from "@/components/ingredients/ingredient-category-selector";
import { IngredientPicker } from "@/components/ingredients/ingredient-picker";
import { InventoryPriceInput } from "@/components/inventory/inventory-price-input";
import type {
  IngredientCategory,
  IngredientSubtype,
  IngredientSuggestionItem,
  IngredientType
} from "@/features/ingredients/contracts";
import { resolveIngredientCategory, resolveLegacyIngredientType } from "@/features/ingredients/taxonomy";
import type { InventoryListItemDto } from "@/features/inventory/contracts";
import {
  formatInventoryQuantityInputValue,
  resolveInventoryMeasurementForDisplay
} from "@/features/inventory/display";
import type { InventoryPriceInputMode } from "@/features/inventory/purchase-cost";
import {
  inventoryUnitLabels,
  resolveHumanFacingInventoryUnitProfile,
  type InventoryUnit
} from "@/features/inventory/units";
import { convertCurrencyMinor, formatMoneyInputValueFromMinor } from "@/features/system/money";
import type { SystemCurrency, SystemCurrencyRateMap } from "@/features/system/currency";

type Props = {
  item: InventoryListItemDto;
  preferredCurrency: SystemCurrency;
  currencyRates: SystemCurrencyRateMap;
  renderTrigger?: (onClick: () => void) => React.ReactNode;
};

type FormState = {
  type: IngredientType;
  category: IngredientCategory;
  subtype: IngredientSubtype | null;
  familyId: string | null;
  pickerValue: string;
  selectedDisplayName: string;
  ingredientCatalogItemId: string | null;
  userCustomIngredientId: string | null;
  enteredQuantity: string;
  enteredUnit: InventoryUnit;
  priceInputMode: InventoryPriceInputMode;
  priceInputAmount: string;
  purchasedAt: string;
  freshnessDate: string;
  notes: string;
};

const formatDateInput = (value: Date | null) => {
  if (!value) {
    return "";
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const resolveInventoryEditorUnitProfile = (
  form: Pick<FormState, "type" | "category" | "subtype" | "enteredUnit">,
  source?: Pick<InventoryListItemDto["source"], "defaultDisplayUnit" | "allowedUnits" | "measurementDimension" | "technicalData"> | null,
  selected?: Pick<IngredientSuggestionItem, "type" | "category" | "subtype" | "defaultDisplayUnit" | "defaultUnit" | "allowedUnits" | "measurementDimension" | "technicalData"> | null
) => resolveHumanFacingInventoryUnitProfile({
  type: selected?.type ?? form.type,
  category: selected?.category ?? form.category,
  subtype: selected?.subtype ?? form.subtype,
  defaultDisplayUnit: selected?.defaultDisplayUnit ?? selected?.defaultUnit ?? source?.defaultDisplayUnit,
  allowedUnits: selected?.allowedUnits ?? source?.allowedUnits,
  measurementDimension: selected?.measurementDimension ?? source?.measurementDimension,
  technicalData: selected?.technicalData ?? source?.technicalData ?? null
});

const createFormState = (
  item: InventoryListItemDto,
  preferredCurrency: SystemCurrency,
  currencyRates: SystemCurrencyRateMap
): FormState => {
  const displayMeasurement = resolveInventoryMeasurementForDisplay({
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
  });
  const storedPriceInputCurrency = item.priceInputCurrency ?? item.purchaseCurrency;
  const storedPriceInputAmountMinor = item.priceInputAmountMinor ?? item.purchasePriceMinor;
  const displayPriceMinor = storedPriceInputAmountMinor != null && storedPriceInputCurrency
    ? convertCurrencyMinor(storedPriceInputAmountMinor, storedPriceInputCurrency, preferredCurrency, currencyRates)
    : storedPriceInputAmountMinor;

  return {
    type: item.source.type,
    category: item.source.category ?? resolveIngredientCategory({ type: item.source.type }),
    subtype: item.source.subtype ?? null,
    familyId: item.source.familyId ?? null,
    pickerValue: item.source.displayName,
    selectedDisplayName: item.source.displayName,
    ingredientCatalogItemId: item.source.sourceKind === "catalog" ? item.source.sourceId : null,
    userCustomIngredientId: item.source.sourceKind === "custom" ? item.source.sourceId : null,
    enteredQuantity: formatInventoryQuantityInputValue(displayMeasurement.quantity),
    enteredUnit: displayMeasurement.unit,
    priceInputMode: item.priceInputMode ?? (displayPriceMinor != null ? "total" : "total"),
    priceInputAmount: formatMoneyInputValueFromMinor(displayPriceMinor),
    purchasedAt: formatDateInput(item.purchasedAt),
    freshnessDate: formatDateInput(item.freshnessDate),
    notes: item.notes ?? ""
  };
};

const canSubmitInventoryForm = (form: FormState) => {
  if (!form.ingredientCatalogItemId && !form.userCustomIngredientId) {
    return false;
  }

  const quantity = Number(form.enteredQuantity);
  return Number.isFinite(quantity) && quantity > 0;
};

export function InventoryItemDetailsEditor({ item, preferredCurrency, currencyRates, renderTrigger }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(() => createFormState(item, preferredCurrency, currencyRates));
  const [selectedSuggestion, setSelectedSuggestion] = useState<IngredientSuggestionItem | null>(null);
  const [result, setResult] = useState<AddIngredientResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const unitProfile = useMemo(
    () => resolveInventoryEditorUnitProfile(form, item.source, selectedSuggestion),
    [form, item.source, selectedSuggestion]
  );

  useEffect(() => {
    setForm(createFormState(item, preferredCurrency, currencyRates));
    setSelectedSuggestion(null);
    setEditing(false);
  }, [item, preferredCurrency, currencyRates]);

  const resetForm = () => {
    setForm(createFormState(item, preferredCurrency, currencyRates));
    setSelectedSuggestion(null);
    setResult(null);
    setEditing(false);
  };

  const purchasePriceError = result?.fieldErrors?.priceInputAmountMinor ?? result?.fieldErrors?.purchasePriceMinor ?? result?.fieldErrors?.purchasePrice;

  const openEditor = () => {
    setForm(createFormState(item, preferredCurrency, currencyRates));
    setSelectedSuggestion(null);
    setResult(null);
    setEditing(true);
  };

  return (
    <>
      {renderTrigger
        ? renderTrigger(openEditor)
        : (
          <button type="button" onClick={openEditor} className="rounded border px-2 py-1 text-xs">
            Редактировать карточку
          </button>
        )}
      {result && !editing ? <p className={`text-xs ${result.ok ? "text-emerald-700" : "text-red-600"}`}>{result.message}</p> : null}

      {editing ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={`Редактирование: ${item.source.displayName}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              resetForm();
            }
          }}
        >
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 sm:max-w-2xl sm:rounded-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-950">Редактирование</h2>
              <button type="button" onClick={resetForm} className="text-sm text-zinc-500 transition-colors hover:text-zinc-700">Закрыть</button>
            </div>

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                startTransition(async () => {
                  const nextResult = await updateInventoryItemAction({
                    inventoryItemId: item.id,
                    ingredientCatalogItemId: form.ingredientCatalogItemId,
                    userCustomIngredientId: form.userCustomIngredientId,
                    enteredQuantity: form.enteredQuantity,
                    enteredUnit: form.enteredUnit,
                    priceInputMode: form.priceInputMode,
                    priceInputAmount: form.priceInputAmount,
                    purchasedAt: form.purchasedAt,
                    freshnessDate: form.freshnessDate,
                    notes: form.notes
                  });

                  setResult(nextResult);
                  if (nextResult.ok) {
                    setEditing(false);
                  }
                });
              }}
            >
              <IngredientCategorySelector
                value={form.category}
                name={`inventory-category-${item.id}`}
                onChange={(nextCategory) => {
                  const nextUnitProfile = resolveHumanFacingInventoryUnitProfile({ category: nextCategory });
                  setSelectedSuggestion(null);
                  setForm({
                    ...form,
                    type: resolveLegacyIngredientType({ category: nextCategory }),
                    category: nextCategory,
                    subtype: null,
                    familyId: null,
                    pickerValue: "",
                    selectedDisplayName: "",
                    ingredientCatalogItemId: null,
                    userCustomIngredientId: null,
                    enteredUnit: nextUnitProfile.defaultUnit
                  });
                  setResult(null);
                }}
              />

              <div className="space-y-1">
                <label className="text-sm font-medium">Ингредиент</label>
                <IngredientPicker
                  category={form.category}
                  value={form.pickerValue}
                  onValueChange={(nextValue) => {
                    const clearsSelectedSuggestion = nextValue.trim() !== (selectedSuggestion?.displayName ?? form.selectedDisplayName).trim();
                    const resetUnitProfile = resolveHumanFacingInventoryUnitProfile({ category: form.category });
                    setForm((current) => ({
                      ...current,
                      pickerValue: nextValue,
                      subtype: nextValue.trim() !== current.selectedDisplayName.trim() ? null : current.subtype,
                      familyId: nextValue.trim() !== current.selectedDisplayName.trim() ? null : current.familyId,
                      ingredientCatalogItemId: nextValue.trim() !== current.selectedDisplayName.trim() ? null : current.ingredientCatalogItemId,
                      userCustomIngredientId: nextValue.trim() !== current.selectedDisplayName.trim() ? null : current.userCustomIngredientId,
                      enteredUnit: nextValue.trim() !== current.selectedDisplayName.trim()
                        ? (
                            resetUnitProfile.allowedUnits.includes(current.enteredUnit)
                              ? current.enteredUnit
                              : resetUnitProfile.defaultUnit
                          )
                        : current.enteredUnit
                    }));
                    if (clearsSelectedSuggestion) {
                      setSelectedSuggestion(null);
                    }
                    setResult(null);
                  }}
                  onSelect={(selected) => {
                    const nextUnitProfile = resolveInventoryEditorUnitProfile(form, item.source, selected);
                    setSelectedSuggestion(selected);
                    setForm((current) => {
                      return {
                        ...current,
                        type: selected.type,
                        category: selected.category ?? current.category,
                        subtype: selected.subtype ?? null,
                        familyId: selected.familyId ?? null,
                        pickerValue: selected.displayName,
                        selectedDisplayName: selected.displayName,
                        ingredientCatalogItemId: selected.id,
                        userCustomIngredientId: null,
                        enteredUnit: nextUnitProfile.defaultUnit
                      };
                    });
                    setResult(null);
                  }}
                  placeholder="Найдите ингредиент"
                  emptyCta={<p className="text-xs text-zinc-500">Не нашли подходящую позицию. Уточните запрос или оставьте текущий ингредиент без изменений.</p>}
                />
                {result?.fieldErrors?.ingredientCatalogItemId ? <p className="text-xs text-red-600">{result.fieldErrors.ingredientCatalogItemId}</p> : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">Количество
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={form.enteredQuantity}
                    onChange={(event) => {
                      setForm((current) => ({ ...current, enteredQuantity: event.target.value }));
                      setResult(null);
                    }}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                    inputMode="decimal"
                  />
                  {result?.fieldErrors?.enteredQuantity ? <span className="text-xs text-red-600">{result.fieldErrors.enteredQuantity}</span> : null}
                </label>

                <label className="text-sm">Ед. изм.
                  <select
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                    value={form.enteredUnit}
                    onChange={(event) => {
                      setForm((current) => ({ ...current, enteredUnit: event.target.value as InventoryUnit }));
                      setResult(null);
                    }}
                  >
                    {unitProfile.allowedUnits.map((unit) => <option key={unit} value={unit}>{inventoryUnitLabels[unit]}</option>)}
                  </select>
                  {result?.fieldErrors?.enteredUnit ? <span className="text-xs text-red-600">{result.fieldErrors.enteredUnit}</span> : null}
                </label>

                <label className="text-sm">Дата покупки
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                    value={form.purchasedAt}
                    onChange={(event) => {
                      setForm((current) => ({ ...current, purchasedAt: event.target.value }));
                      setResult(null);
                    }}
                  />
                </label>

                <label className="text-sm">Годен до
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                    value={form.freshnessDate}
                    onChange={(event) => {
                      setForm((current) => ({ ...current, freshnessDate: event.target.value }));
                      setResult(null);
                    }}
                  />
                </label>
              </div>

              <InventoryPriceInput
                preferredCurrency={preferredCurrency}
                priceInputMode={form.priceInputMode}
                priceInputAmount={form.priceInputAmount}
                enteredQuantity={form.enteredQuantity}
                enteredUnit={form.enteredUnit}
                fieldError={purchasePriceError}
                onPriceInputModeChange={(mode) => {
                  setForm((current) => ({ ...current, priceInputMode: mode }));
                  setResult(null);
                }}
                onPriceInputAmountChange={(value) => {
                  setForm((current) => ({ ...current, priceInputAmount: value }));
                  setResult(null);
                }}
                type={form.type}
                category={form.category}
                subtype={form.subtype}
                defaultDisplayUnit={selectedSuggestion?.defaultDisplayUnit ?? selectedSuggestion?.defaultUnit ?? item.source.defaultDisplayUnit}
                allowedUnits={selectedSuggestion?.allowedUnits ?? item.source.allowedUnits}
                measurementDimension={selectedSuggestion?.measurementDimension ?? item.source.measurementDimension}
                technicalData={selectedSuggestion?.technicalData ?? item.source.technicalData}
              />

              <label className="block text-sm">Заметки
                <textarea
                  className="mt-1 h-20 w-full rounded-lg border border-zinc-200 px-3 py-2"
                  value={form.notes}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, notes: event.target.value }));
                    setResult(null);
                  }}
                />
                {result?.fieldErrors?.notes ? <span className="text-xs text-red-600">{result.fieldErrors.notes}</span> : null}
              </label>

              {result && !result.ok ? <p className="text-xs text-red-600">{result.message}</p> : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={isPending || !canSubmitInventoryForm(form)}
                  className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? "Сохраняем..." : "Сохранить"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-zinc-200 px-5 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
