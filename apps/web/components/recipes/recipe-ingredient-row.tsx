"use client";

import React from "react";

import { IngredientCategorySelector } from "@/components/ingredients/ingredient-category-selector";
import { IngredientPicker } from "@/components/ingredients/ingredient-picker";
import {
  type IngredientCategory,
  type IngredientSubtype,
  type IngredientSuggestionItem,
  type IngredientType
} from "@/features/ingredients/contracts";
import {
  resolveIngredientDisplayNames
} from "@/features/ingredients/presentation";
import { resolveLegacyIngredientType } from "@/features/ingredients/taxonomy";
import { getInventoryUnitInputStep, parseInventoryUnit, resolveHumanFacingInventoryUnitProfile } from "@/features/inventory/units";
import { recipeIngredientStages, type RecipeIngredientStage } from "@/features/recipes/contracts";

export type RecipeIngredientEditorRowValue = {
  localId: string;
  ingredientCatalogItemId: string | null;
  userCustomIngredientId: string | null;
  selectedName: string;
  selectedSecondaryName: string;
  selectedSummary: string;
  familyDisplayName: string;
  category: IngredientCategory;
  subtype: IngredientSubtype | null;
  familyId: string | null;
  type: IngredientType;
  defaultDisplayUnit: string;
  allowedUnits: string[];
  measurementDimension: string | null;
  amountEnteredQuantity: string;
  amountEnteredUnit: string;
  stage: RecipeIngredientStage;
  timeOffset: string;
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

export const resolveRecipeIngredientUnitProfile = (value: Pick<
  RecipeIngredientEditorRowValue,
  "type" | "category" | "subtype" | "defaultDisplayUnit" | "allowedUnits" | "measurementDimension"
>) => resolveHumanFacingInventoryUnitProfile({
  type: value.type,
  category: value.category,
  subtype: value.subtype,
  defaultDisplayUnit: value.defaultDisplayUnit,
  allowedUnits: value.allowedUnits,
  measurementDimension: value.measurementDimension
});

export const applyRecipeIngredientCategoryChange = (
  value: RecipeIngredientEditorRowValue,
  category: IngredientCategory
): RecipeIngredientEditorRowValue => {
  const unitProfile = resolveHumanFacingInventoryUnitProfile({ category });

  return {
    ...value,
    ingredientCatalogItemId: null,
    userCustomIngredientId: null,
    selectedName: "",
    selectedSecondaryName: "",
    selectedSummary: "",
    familyDisplayName: "",
    category,
    subtype: null,
    familyId: null,
    type: resolveLegacyIngredientType({ category }),
    defaultDisplayUnit: unitProfile.defaultUnit,
    allowedUnits: unitProfile.allowedUnits,
    measurementDimension: unitProfile.measurementDimension,
    amountEnteredUnit: unitProfile.defaultUnit
  };
};

export const applyRecipeIngredientTextChange = (
  value: RecipeIngredientEditorRowValue,
  nextValue: string
): RecipeIngredientEditorRowValue => {
  if (!hasRecipeIngredientSelection(value)) {
    return {
      ...value,
      selectedName: nextValue,
      selectedSecondaryName: ""
    };
  }

  if (nextValue.trim() === value.selectedName.trim()) {
    return {
      ...value,
      selectedName: nextValue
    };
  }

  const unitProfile = resolveHumanFacingInventoryUnitProfile({ category: value.category });

  return {
    ...value,
    selectedName: nextValue,
    selectedSecondaryName: "",
    selectedSummary: "",
    familyDisplayName: "",
    subtype: null,
    familyId: null,
    ingredientCatalogItemId: null,
    userCustomIngredientId: null,
    defaultDisplayUnit: unitProfile.defaultUnit,
    allowedUnits: unitProfile.allowedUnits,
    measurementDimension: unitProfile.measurementDimension,
    amountEnteredUnit: unitProfile.allowedUnits.includes(value.amountEnteredUnit as typeof unitProfile.allowedUnits[number])
      ? value.amountEnteredUnit
      : unitProfile.defaultUnit
  };
};

export const applyRecipeIngredientSelection = (
  value: RecipeIngredientEditorRowValue,
  item: IngredientSuggestionItem
): RecipeIngredientEditorRowValue => {
  const unitProfile = resolveHumanFacingInventoryUnitProfile({
    type: item.type,
    category: item.category ?? value.category,
    subtype: item.subtype ?? null,
    defaultDisplayUnit: item.defaultDisplayUnit ?? item.defaultUnit,
    allowedUnits: item.allowedUnits,
    measurementDimension: item.measurementDimension
  });
  const { primaryName, secondaryName } = resolveIngredientDisplayNames(item);

  return {
    ...value,
    ingredientCatalogItemId: item.source === "catalog" ? item.id : null,
    userCustomIngredientId: item.source === "custom" ? item.id : null,
    selectedName: primaryName,
    selectedSecondaryName: secondaryName ?? "",
    selectedSummary: item.subtitle ?? "",
    familyDisplayName: item.familyDisplayName ?? item.familyCanonicalName ?? "",
    category: item.category ?? value.category,
    subtype: item.subtype ?? null,
    familyId: item.familyId ?? null,
    type: item.type,
    defaultDisplayUnit: unitProfile.defaultUnit,
    allowedUnits: unitProfile.allowedUnits,
    measurementDimension: unitProfile.measurementDimension,
    amountEnteredUnit: unitProfile.defaultUnit
  };
};

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
  showErrors?: boolean;
};

const fieldErrorClass = "border-red-300";

export function RecipeIngredientRow({
  value,
  onChange,
  title,
  description,
  footer,
  disableAmountUntilSelected = false,
  showErrors = false
}: Props) {
  const allowedUnits = resolveRecipeIngredientUnitProfile(value).allowedUnits;
  const hasSelectedIngredient = hasRecipeIngredientSelection(value);
  const amountFieldsDisabled = disableAmountUntilSelected && !hasSelectedIngredient;
  const quantityUnit = parseInventoryUnit(value.amountEnteredUnit) ?? parseInventoryUnit(allowedUnits[0] ?? "") ?? "g";
  const quantityStep = getInventoryUnitInputStep(quantityUnit);

  const ingredientError = showErrors && !hasSelectedIngredient
    ? "Выберите ингредиент из подсказок"
    : null;

  const quantity = Number(value.amountEnteredQuantity);
  const amountError = showErrors && hasSelectedIngredient
    ? (!value.amountEnteredQuantity.trim()
        ? "Укажите количество"
        : (!Number.isFinite(quantity) || quantity <= 0)
          ? "Количество должно быть больше нуля"
          : null)
    : null;

  return (
    <article className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3" data-testid="recipe-ingredient-row">
      {title || description ? (
        <header className="space-y-1">
          {title ? <h3 className="text-sm font-semibold text-zinc-900">{title}</h3> : null}
          {description ? <p className="text-xs text-zinc-600">{description}</p> : null}
        </header>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <IngredientCategorySelector value={value.category} onChange={(nextCategory) => onChange(applyRecipeIngredientCategoryChange(value, nextCategory))} />
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
          category={value.category}
          value={value.selectedName}
          onValueChange={(next) => onChange(applyRecipeIngredientTextChange(value, next))}
          onSelect={(item) => onChange(applyRecipeIngredientSelection(value, item))}
          placeholder="Найти ингредиент"
          emptyCta={<p className="text-xs text-zinc-500">Ничего не найдено. Уточните запрос.</p>}
        />
        {ingredientError ? (
          <p className="text-xs text-red-500">{ingredientError}</p>
        ) : hasSelectedIngredient ? (
          <p className="text-xs text-zinc-600">
            Ингредиент выбран.
            {value.selectedSecondaryName ? ` ${value.selectedSecondaryName}.` : ""}
            {value.familyDisplayName ? ` ${value.familyDisplayName}.` : ""}
            {value.selectedSummary ? ` ${value.selectedSummary}.` : ""}
          </p>
        ) : (
          <p className="text-xs text-zinc-500">Сначала выберите категорию и позицию из подсказок, затем вводите количество.</p>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_140px_1fr]">
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-700">Количество</label>
          <input
            type="number"
            min={0}
            step={quantityStep}
            disabled={amountFieldsDisabled}
            value={value.amountEnteredQuantity}
            onChange={(event) => onChange({ ...value, amountEnteredQuantity: event.target.value })}
            className={`h-10 w-full rounded-md border bg-white px-3 text-sm disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 ${amountError ? fieldErrorClass : "border-zinc-200"}`}
            placeholder={amountFieldsDisabled ? "Сначала выберите ингредиент" : undefined}
          />
          {amountError ? <p className="text-xs text-red-500">{amountError}</p> : null}
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
