"use client";

import React from "react";
import { useEffect, useMemo, useState, useTransition } from "react";

import { updateInventoryItemAction, type AddIngredientResult } from "@/app/(app)/app/ingredients/actions";
import { IngredientPicker } from "@/components/ingredients/ingredient-picker";
import type { IngredientType } from "@/features/ingredients/contracts";
import type { InventoryListItemDto } from "@/features/inventory/contracts";
import {
  getDefaultInventoryUnit,
  getInventoryUnitOptions,
  inventoryUnitLabels,
  isUnitAllowedForIngredientType,
  parseInventoryUnit,
  type InventoryUnit
} from "@/features/inventory/units";

import { IngredientTypeSelector } from "./ingredient-type-selector";

type Props = {
  item: InventoryListItemDto;
};

type FormState = {
  type: IngredientType;
  pickerValue: string;
  selectedDisplayName: string;
  ingredientCatalogItemId: string | null;
  userCustomIngredientId: string | null;
  enteredQuantity: string;
  enteredUnit: InventoryUnit;
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

const createFormState = (item: InventoryListItemDto): FormState => ({
  type: item.source.type,
  pickerValue: item.source.displayName,
  selectedDisplayName: item.source.displayName,
  ingredientCatalogItemId: item.source.sourceKind === "catalog" ? item.source.sourceId : null,
  userCustomIngredientId: item.source.sourceKind === "custom" ? item.source.sourceId : null,
  enteredQuantity: String(item.enteredQuantity),
  enteredUnit: item.enteredUnit,
  purchasedAt: formatDateInput(item.purchasedAt),
  freshnessDate: formatDateInput(item.freshnessDate),
  notes: item.notes ?? ""
});

const canSubmitInventoryForm = (form: FormState) => {
  if (!form.ingredientCatalogItemId && !form.userCustomIngredientId) {
    return false;
  }

  const quantity = Number(form.enteredQuantity);
  return Number.isFinite(quantity) && quantity > 0;
};

export function InventoryItemDetailsEditor({ item }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(() => createFormState(item));
  const [result, setResult] = useState<AddIngredientResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const unitOptions = useMemo(() => getInventoryUnitOptions(form.type), [form.type]);

  useEffect(() => {
    setForm(createFormState(item));
    setEditing(false);
  }, [item]);

  const resetForm = () => {
    setForm(createFormState(item));
    setResult(null);
    setEditing(false);
  };

  return (
    <div className="space-y-2">
      {!editing ? (
        <>
          <button
            type="button"
            onClick={() => {
              setForm(createFormState(item));
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

          <IngredientTypeSelector
            value={form.type}
            name={`inventory-type-${item.id}`}
            onChange={(nextType) => {
              setForm({
                ...form,
                type: nextType,
                pickerValue: "",
                selectedDisplayName: "",
                ingredientCatalogItemId: null,
                userCustomIngredientId: null,
                enteredUnit: getDefaultInventoryUnit(nextType)
              });
              setResult(null);
            }}
          />

          <div className="space-y-1">
            <label className="text-sm font-medium">Ингредиент</label>
            <IngredientPicker
              type={form.type}
              value={form.pickerValue}
              onValueChange={(nextValue) => {
                setForm((current) => ({
                  ...current,
                  pickerValue: nextValue,
                  ingredientCatalogItemId: nextValue.trim() !== current.selectedDisplayName.trim() ? null : current.ingredientCatalogItemId,
                  userCustomIngredientId: nextValue.trim() !== current.selectedDisplayName.trim() ? null : current.userCustomIngredientId
                }));
                setResult(null);
              }}
              onSelect={(selected) => {
                setForm((current) => {
                  const defaultUnit = parseInventoryUnit(selected.defaultUnit);
                  const enteredUnit = defaultUnit && isUnitAllowedForIngredientType(defaultUnit, selected.type)
                    ? defaultUnit
                    : current.enteredUnit;

                  return {
                    ...current,
                    type: selected.type,
                    pickerValue: selected.displayName,
                    selectedDisplayName: selected.displayName,
                    ingredientCatalogItemId: selected.id,
                    userCustomIngredientId: null,
                    enteredUnit
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
                {unitOptions.map((unit) => <option key={unit} value={unit}>{inventoryUnitLabels[unit]}</option>)}
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
