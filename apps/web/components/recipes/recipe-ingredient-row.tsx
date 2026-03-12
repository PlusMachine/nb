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

export const recipeIngredientTypeLabels: Record<IngredientType, string> = {
  fermentable: "Ферментируемый ингредиент",
  hop: "Хмель",
  yeast: "Дрожжи",
  sugar: "Сахар",
  adjunct: "Добавка",
  fining: "Осветлитель",
  misc: "Прочее"
};

export const recipeIngredientStageLabels: Record<RecipeIngredientStage, string> = {
  mash: "Затирание",
  boil: "Кипячение",
  whirlpool: "Вирпул",
  fermentation: "Ферментация",
  packaging: "Розлив",
  other: "Другое"
};

export const hasRecipeIngredientSelection = (value: RecipeIngredientEditorRowValue) => (
  Boolean(value.ingredientCatalogItemId || value.userCustomIngredientId)
);

export const getRecipeIngredientValidationError = (value: RecipeIngredientEditorRowValue) => {
  if (!hasRecipeIngredientSelection(value)) {
    return "Выберите ингредиент из подсказок.";
  }

  if (!value.amountEnteredQuantity.trim()) {
    return "Укажите количество.";
  }

  const quantity = Number(value.amountEnteredQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return "Количество должно быть больше нуля.";
  }

  return null;
};

type Props = {
  value: RecipeIngredientEditorRowValue;
  onChange: (value: RecipeIngredientEditorRowValue) => void;
  title?: string;
  description?: string;
  footer?: React.ReactNode;
  disableAmountUntilSelected?: boolean;
};

export function RecipeIngredientRow({
  value,
  onChange,
  title,
  description,
  footer,
  disableAmountUntilSelected = false
}: Props) {
  const allowedUnits = getInventoryUnitOptions(value.type);
  const hasSelectedIngredient = hasRecipeIngredientSelection(value);
  const amountFieldsDisabled = disableAmountUntilSelected && !hasSelectedIngredient;

  return (
    <article className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3" data-testid="recipe-ingredient-row">
      {title || description ? (
        <header className="space-y-1">
          {title ? <h3 className="text-sm font-semibold text-zinc-900">{title}</h3> : null}
          {description ? <p className="text-xs text-zinc-600">{description}</p> : null}
        </header>
      ) : null}

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
            {ingredientTypes.map((type) => <option key={type} value={type}>{recipeIngredientTypeLabels[type]}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-700">Этап</label>
          <select
            value={value.stage}
            onChange={(event) => onChange({ ...value, stage: event.target.value as RecipeIngredientStage })}
            className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
          >
            {recipeIngredientStages.map((stage) => <option key={stage} value={stage}>{recipeIngredientStageLabels[stage]}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-700">Ингредиент</label>
        <IngredientPicker
          type={value.type}
          value={value.selectedName}
          onValueChange={(next) => onChange({
            ...value,
            selectedName: next,
            ingredientCatalogItemId: hasSelectedIngredient && next.trim() !== value.selectedName.trim() ? null : value.ingredientCatalogItemId,
            userCustomIngredientId: hasSelectedIngredient && next.trim() !== value.selectedName.trim() ? null : value.userCustomIngredientId
          })}
          onSelect={(item) => onChange({
            ...value,
            ingredientCatalogItemId: item.id,
            userCustomIngredientId: null,
            selectedName: item.displayName
          })}
          placeholder="Найти ингредиент"
          emptyCta={<p className="text-xs text-zinc-500">Ничего не найдено. Уточните запрос.</p>}
        />
        {hasSelectedIngredient ? (
          <p className="text-xs text-zinc-600">Ингредиент выбран. Теперь укажите количество и сохраните действие.</p>
        ) : (
          <p className="text-xs text-zinc-500">Сначала выберите позицию из подсказок, затем вводите количество.</p>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_140px_1fr]">
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-700">Количество</label>
          <input
            type="number"
            min={0.001}
            step="0.001"
            disabled={amountFieldsDisabled}
            value={value.amountEnteredQuantity}
            onChange={(event) => onChange({ ...value, amountEnteredQuantity: event.target.value })}
            className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
            placeholder={amountFieldsDisabled ? "Сначала выберите ингредиент" : undefined}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-700">Ед.</label>
          <select
            disabled={amountFieldsDisabled}
            value={value.amountEnteredUnit}
            onChange={(event) => onChange({ ...value, amountEnteredUnit: event.target.value })}
            className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
          >
            {allowedUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-700">Смещение по времени (мин)</label>
          <input
            type="number"
            disabled={amountFieldsDisabled}
            value={value.timeOffset}
            onChange={(event) => onChange({ ...value, timeOffset: event.target.value })}
            className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
            placeholder="опционально"
          />
        </div>
      </div>

      {footer}
    </article>
  );
}
