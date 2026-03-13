"use client";

import React from "react";
import { useEffect, useMemo, useState, useTransition } from "react";

import { updateInventoryItemAction, type AddIngredientResult } from "@/app/(app)/app/ingredients/actions";
import { IngredientCategorySelector } from "@/components/ingredients/ingredient-category-selector";
import { IngredientPicker } from "@/components/ingredients/ingredient-picker";
import type {
  IngredientCategory,
  IngredientSubtype,
  IngredientSuggestionItem,
  IngredientType
} from "@/features/ingredients/contracts";
import { resolveIngredientCategory, resolveLegacyIngredientType } from "@/features/ingredients/taxonomy";
import { formatMoneyInputValueFromMinor } from "@/features/system/money";
import type { SystemCurrency } from "@/features/system/currency";
import type { InventoryListItemDto } from "@/features/inventory/contracts";
import {
  inventoryUnitLabels,
  resolveInventoryUnitProfile,
  type InventoryUnit
} from "@/features/inventory/units";

type Props = {
  item: InventoryListItemDto;
  preferredCurrency: SystemCurrency;
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
  purchasePrice: string;
  purchaseCurrency: SystemCurrency;
  purchaseQuantity: string;
  purchaseQuantityUnit: InventoryUnit;
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
) => resolveInventoryUnitProfile({
  type: selected?.type ?? form.type,
  category: selected?.category ?? form.category,
  subtype: selected?.subtype ?? form.subtype,
  defaultDisplayUnit: selected?.defaultDisplayUnit ?? selected?.defaultUnit ?? source?.defaultDisplayUnit,
  allowedUnits: selected?.allowedUnits ?? source?.allowedUnits,
  measurementDimension: selected?.measurementDimension ?? source?.measurementDimension,
  technicalData: selected?.technicalData ?? source?.technicalData ?? null
});

const createFormState = (item: InventoryListItemDto, preferredCurrency: SystemCurrency): FormState => {
  const fallbackUnit = item.purchaseQuantityUnit ?? item.source.defaultDisplayUnit ?? item.enteredUnit;

  return {
    type: item.source.type,
    category: item.source.category ?? resolveIngredientCategory({ type: item.source.type }),
    subtype: item.source.subtype ?? null,
    familyId: item.source.familyId ?? null,
    pickerValue: item.source.displayName,
    selectedDisplayName: item.source.displayName,
    ingredientCatalogItemId: item.source.sourceKind === "catalog" ? item.source.sourceId : null,
    userCustomIngredientId: item.source.sourceKind === "custom" ? item.source.sourceId : null,
    enteredQuantity: String(item.enteredQuantity),
    enteredUnit: item.enteredUnit,
    purchasePrice: formatMoneyInputValueFromMinor(item.purchasePriceMinor),
    purchaseCurrency: item.purchaseCurrency ?? preferredCurrency,
    purchaseQuantity: item.purchaseQuantity == null ? "" : String(item.purchaseQuantity),
    purchaseQuantityUnit: fallbackUnit,
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

export function InventoryItemDetailsEditor({ item, preferredCurrency }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(() => createFormState(item, preferredCurrency));
  const [result, setResult] = useState<AddIngredientResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const unitProfile = useMemo(
    () => resolveInventoryEditorUnitProfile(form, item.source),
    [form, item.source]
  );

  useEffect(() => {
    setForm(createFormState(item, preferredCurrency));
    setEditing(false);
  }, [item, preferredCurrency]);

  const resetForm = () => {
    setForm(createFormState(item, preferredCurrency));
    setResult(null);
    setEditing(false);
  };

  const purchasePriceError = result?.fieldErrors?.purchasePriceMinor ?? result?.fieldErrors?.purchasePrice;

  return (
    <div className="space-y-2">
      {!editing ? (
        <>
          <button
            type="button"
            onClick={() => {
              setForm(createFormState(item, preferredCurrency));
              setResult(null);
              setEditing(true);
            }}
            className="rounded border px-2 py-1 text-xs"
          >
            Редактировать карточку
          </button>
          {result ? <p className={`text-xs ${result.ok ? "text-emerald-700" : "text-red-600"}`}>{result.message}</p> : null}
        </>
      ) : (
        <form
          className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const nextResult = await updateInventoryItemAction({
                inventoryItemId: item.id,
                ingredientCatalogItemId: form.ingredientCatalogItemId,
                userCustomIngredientId: form.userCustomIngredientId,
                enteredQuantity: form.enteredQuantity,
                enteredUnit: form.enteredUnit,
                purchasePrice: form.purchasePrice,
                purchaseCurrency: form.purchaseCurrency,
                purchaseQuantity: form.purchaseQuantity,
                purchaseQuantityUnit: form.purchaseQuantityUnit,
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
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-zinc-900">Полное редактирование</h4>
            <p className="text-xs text-zinc-600">Можно заменить ингредиент, поправить остаток, даты и заметки. Быстрое редактирование количества выше остаётся отдельным действием.</p>
          </div>

          <IngredientCategorySelector
            value={form.category}
            name={`inventory-category-${item.id}`}
            onChange={(nextCategory) => {
              const nextUnitProfile = resolveInventoryUnitProfile({ category: nextCategory });
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
                enteredUnit: nextUnitProfile.defaultUnit,
                purchaseQuantityUnit: nextUnitProfile.defaultUnit
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
                const resetUnitProfile = resolveInventoryUnitProfile({ category: form.category });
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
                    : current.enteredUnit,
                  purchaseQuantityUnit: nextValue.trim() !== current.selectedDisplayName.trim()
                    ? (
                        resetUnitProfile.allowedUnits.includes(current.purchaseQuantityUnit)
                          ? current.purchaseQuantityUnit
                          : resetUnitProfile.defaultUnit
                      )
                    : current.purchaseQuantityUnit
                }));
                setResult(null);
              }}
              onSelect={(selected) => {
                const nextUnitProfile = resolveInventoryEditorUnitProfile(form, item.source, selected);
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
                    enteredUnit: nextUnitProfile.defaultUnit,
                    purchaseQuantityUnit: nextUnitProfile.allowedUnits.includes(current.purchaseQuantityUnit)
                      ? current.purchaseQuantityUnit
                      : nextUnitProfile.defaultUnit
                  };
                });
                setResult(null);
              }}
              placeholder="Найдите ингредиент"
              emptyCta={<p className="text-xs text-zinc-500">Не нашли подходящую позицию. Уточните запрос или оставьте текущий ингредиент без изменений.</p>}
            />
            <p className="text-xs text-zinc-500">
              {item.source.sourceKind === "custom"
                ? "Сейчас выбрана пользовательская позиция. Здесь можно оставить её как есть или заменить на ингредиент из каталога."
                : "Можно выбрать другую позицию из каталога, если изначально был выбран не тот ингредиент."}
            </p>
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
                className="mt-1 w-full rounded-md border px-2 py-2"
                inputMode="decimal"
              />
              {result?.fieldErrors?.enteredQuantity ? <span className="text-xs text-red-600">{result.fieldErrors.enteredQuantity}</span> : null}
            </label>

            <label className="text-sm">Ед. изм.
              <select
                className="mt-1 w-full rounded-md border px-2 py-2"
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
                className="mt-1 w-full rounded-md border px-2 py-2"
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
                className="mt-1 w-full rounded-md border px-2 py-2"
                value={form.freshnessDate}
                onChange={(event) => {
                  setForm((current) => ({ ...current, freshnessDate: event.target.value }));
                  setResult(null);
                }}
              />
            </label>
          </div>

          <details className="rounded-md border border-zinc-200 bg-white p-3" open={Boolean(form.purchasePrice || form.purchaseQuantity)}>
            <summary className="cursor-pointer text-sm font-medium text-zinc-900">Стоимость покупки</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Цена
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="mt-1 w-full rounded-md border px-2 py-2"
                  value={form.purchasePrice}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, purchasePrice: event.target.value }));
                    setResult(null);
                  }}
                  inputMode="decimal"
                />
                {purchasePriceError ? <span className="text-xs text-red-600">{purchasePriceError}</span> : null}
              </label>

              <label className="text-sm">Валюта
                <select
                  className="mt-1 w-full rounded-md border px-2 py-2"
                  value={form.purchaseCurrency}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, purchaseCurrency: event.target.value as SystemCurrency }));
                    setResult(null);
                  }}
                >
                  <option value="RUB">RUB</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </label>

              <label className="text-sm">Куплено
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  className="mt-1 w-full rounded-md border px-2 py-2"
                  value={form.purchaseQuantity}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, purchaseQuantity: event.target.value }));
                    setResult(null);
                  }}
                  inputMode="decimal"
                />
                {result?.fieldErrors?.purchaseQuantity ? <span className="text-xs text-red-600">{result.fieldErrors.purchaseQuantity}</span> : null}
              </label>

              <label className="text-sm">Ед. закупки
                <select
                  className="mt-1 w-full rounded-md border px-2 py-2"
                  value={form.purchaseQuantityUnit}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, purchaseQuantityUnit: event.target.value as InventoryUnit }));
                    setResult(null);
                  }}
                >
                  {unitProfile.allowedUnits.map((unit) => <option key={unit} value={unit}>{inventoryUnitLabels[unit]}</option>)}
                </select>
              </label>
            </div>
          </details>

          <label className="block text-sm">Заметки
            <textarea
              className="mt-1 h-20 w-full rounded-md border px-2 py-2"
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
              className="rounded bg-black px-3 py-2 text-xs text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Сохраняем..." : "Сохранить карточку"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded border px-3 py-2 text-xs"
            >
              Отмена
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
