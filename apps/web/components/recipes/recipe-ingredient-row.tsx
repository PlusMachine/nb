"use client";

import React from "react";

import { IngredientPicker } from "@/components/ingredients/ingredient-picker";
import { ingredientTypes, type IngredientType } from "@/features/ingredients/contracts";
import { getDefaultInventoryUnit, getInventoryUnitOptions } from "@/features/inventory/units";
import { recipeIngredientStages, type RecipeIngredientStage } from "@/features/recipes/contracts";

export type RecipeIngredientEditorRowValue = {
  localId: string;
  ingredientCatalogItemId: string | null;
  userCustomIngredientId: string | null;
  selectedName: string;
  type: IngredientType;
  amountEnteredQuantity: string;
  amountEnteredUnit: string;
  stage: RecipeIngredientStage;
  timeOffset: string;
};

type Props = {
  value: RecipeIngredientEditorRowValue;
  onChange: (value: RecipeIngredientEditorRowValue) => void;
  onRemove: () => void;
};

export function RecipeIngredientRow({ value, onChange, onRemove }: Props) {
  const allowedUnits = getInventoryUnitOptions(value.type);

  return (
    <article className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3" data-testid="recipe-ingredient-row">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-700">Тип</label>
          <select
            value={value.type}
            onChange={(event) => {
              const nextType = event.target.value as IngredientType;
              onChange({
                ...value,
                type: nextType,
                amountEnteredUnit: getDefaultInventoryUnit(nextType),
                ingredientCatalogItemId: null,
                userCustomIngredientId: null,
                selectedName: ""
              });
            }}
            className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
          >
            {ingredientTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-700">Этап</label>
          <select
            value={value.stage}
            onChange={(event) => onChange({ ...value, stage: event.target.value as RecipeIngredientStage })}
            className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
          >
            {recipeIngredientStages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-700">Ингредиент</label>
        <IngredientPicker
          type={value.type}
          value={value.selectedName}
          onValueChange={(next) => onChange({ ...value, selectedName: next })}
          onSelect={(item) => onChange({
            ...value,
            ingredientCatalogItemId: item.id,
            userCustomIngredientId: null,
            selectedName: item.displayName
          })}
          placeholder="Найти ингредиент"
          emptyCta={<p className="text-xs text-zinc-500">Ничего не найдено. Уточните запрос.</p>}
        />
        {value.userCustomIngredientId && <p className="text-xs text-zinc-600">Выбран пользовательский ингредиент (ID: {value.userCustomIngredientId}).</p>}
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_140px_1fr_auto]">
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-700">Количество</label>
          <input
            type="number"
            min={0.001}
            step="0.001"
            value={value.amountEnteredQuantity}
            onChange={(event) => onChange({ ...value, amountEnteredQuantity: event.target.value })}
            className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-700">Ед.</label>
          <select
            value={value.amountEnteredUnit}
            onChange={(event) => onChange({ ...value, amountEnteredUnit: event.target.value })}
            className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
          >
            {allowedUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-700">Time offset (мин)</label>
          <input
            type="number"
            value={value.timeOffset}
            onChange={(event) => onChange({ ...value, timeOffset: event.target.value })}
            className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
            placeholder="опционально"
          />
        </div>
        <div className="flex items-end">
          <button type="button" onClick={onRemove} className="h-10 rounded-md border border-red-300 bg-white px-3 text-sm text-red-700">Удалить</button>
        </div>
      </div>
    </article>
  );
}
