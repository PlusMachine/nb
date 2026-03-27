"use client";

import React from "react";
import { useState } from "react";

import { ingredientCategoryLabels } from "@/features/ingredients/presentation";
import { resolveLegacyIngredientType } from "@/features/ingredients/taxonomy";
import { resolveHumanFacingInventoryUnitProfile } from "@/features/inventory/units";

import {
  getRecipeIngredientValidationError,
  RecipeIngredientRow,
  recipeIngredientStageLabels,
  type RecipeIngredientEditorRowValue
} from "./recipe-ingredient-row";

type Props = {
  rows: RecipeIngredientEditorRowValue[];
  onChange: (rows: RecipeIngredientEditorRowValue[]) => void;
};

const createEmptyRow = (): RecipeIngredientEditorRowValue => ({
  ...(() => {
    const defaultUnitProfile = resolveHumanFacingInventoryUnitProfile({ category: "fermentable" });

    return {
  localId: crypto.randomUUID(),
  ingredientCatalogItemId: null,
  userCustomIngredientId: null,
  selectedName: "",
  selectedSecondaryName: "",
  selectedSummary: "",
  familyDisplayName: "",
  category: "fermentable",
  subtype: null,
  familyId: null,
  type: resolveLegacyIngredientType({ category: "fermentable" }),
  defaultDisplayUnit: defaultUnitProfile.defaultUnit,
  allowedUnits: defaultUnitProfile.allowedUnits,
  measurementDimension: defaultUnitProfile.measurementDimension,
  amountEnteredQuantity: "",
  amountEnteredUnit: defaultUnitProfile.defaultUnit,
  stage: "other",
  timeOffset: ""
    };
  })()
});

const getRecipeIngredientSummaryTitle = (row: RecipeIngredientEditorRowValue) => (
  row.selectedName.trim() || ingredientCategoryLabels[row.category]
);

export function RecipeIngredientsEditor({ rows, onChange }: Props) {
  const [draftRow, setDraftRow] = useState<RecipeIngredientEditorRowValue>(() => createEmptyRow());
  const [draftError, setDraftError] = useState<string | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<RecipeIngredientEditorRowValue | null>(null);
  const [editingError, setEditingError] = useState<string | null>(null);
  const isDraftReady = !getRecipeIngredientValidationError(draftRow);

  const addDraftRow = () => {
    const error = getRecipeIngredientValidationError(draftRow);
    if (error) {
      setDraftError(error);
      return;
    }

    onChange([...rows, draftRow]);
    setDraftRow(createEmptyRow());
    setDraftError(null);
  };

  const startEditing = (row: RecipeIngredientEditorRowValue) => {
    setEditingRowId(row.localId);
    setEditingRow({ ...row });
    setEditingError(null);
  };

  const saveEditing = () => {
    if (!editingRow) {
      return;
    }

    const error = getRecipeIngredientValidationError(editingRow);
    if (error) {
      setEditingError(error);
      return;
    }

    onChange(rows.map((row) => (row.localId === editingRow.localId ? editingRow : row)));
    setEditingRowId(null);
    setEditingRow(null);
    setEditingError(null);
  };

  const cancelEditing = () => {
    setEditingRowId(null);
    setEditingRow(null);
    setEditingError(null);
  };

  const removeRow = (localId: string) => {
    onChange(rows.filter((candidate) => candidate.localId !== localId));
    if (editingRowId === localId) {
      cancelEditing();
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Ингредиенты</h2>
        <p className="text-sm text-zinc-600">Сначала соберите новый ингредиент и нажмите «Добавить в рецепт». Уже добавленные позиции находятся ниже и редактируются отдельно.</p>
      </div>

      <RecipeIngredientRow
        value={draftRow}
        onChange={(next) => {
          setDraftRow(next);
          setDraftError(null);
        }}
        title="Новый ингредиент"
        description="1. Выберите категорию и нужную позицию из каталога. 2. Укажите количество. 3. Подтвердите добавление."
        disableAmountUntilSelected
        footer={(
          <div className="flex flex-wrap items-start justify-between gap-2 border-t border-zinc-200 pt-3">
            <div className="min-h-5 text-sm text-red-600">{draftError}</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraftRow(createEmptyRow());
                  setDraftError(null);
                }}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
              >
                Очистить
              </button>
              <button
                type="button"
                onClick={addDraftRow}
                disabled={!isDraftReady}
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Добавить в рецепт
              </button>
            </div>
          </div>
        )}
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-900">Уже в рецепте</h3>
          <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-600">{rows.length}</span>
        </div>

        {!rows.length ? <p className="text-sm text-zinc-600">Пока в рецепте нет ингредиентов. Добавьте хотя бы один для расчёта статистики.</p> : null}

        {rows.map((row) => {
          const isEditing = editingRowId === row.localId && editingRow;
          if (isEditing) {
            return (
              <RecipeIngredientRow
                key={row.localId}
                value={editingRow}
                onChange={(next) => {
                  setEditingRow(next);
                  setEditingError(null);
                }}
                title={`Редактирование: ${getRecipeIngredientSummaryTitle(editingRow)}`}
                description="Изменения попадут в рецепт после сохранения этой строки."
                footer={(
                  <div className="flex flex-wrap items-start justify-between gap-2 border-t border-zinc-200 pt-3">
                    <div className="min-h-5 text-sm text-red-600">{editingError}</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => removeRow(row.localId)}
                        className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm text-red-700"
                      >
                        Удалить
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        onClick={saveEditing}
                        className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
                      >
                        Сохранить строку
                      </button>
                    </div>
                  </div>
                )}
              />
            );
          }

          return (
            <article key={row.localId} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-zinc-900">{getRecipeIngredientSummaryTitle(row)}</h4>
                  {row.selectedSecondaryName ? <p className="text-xs text-zinc-500">{row.selectedSecondaryName}</p> : null}
                  <p className="text-xs text-zinc-500">{ingredientCategoryLabels[row.category]} · {recipeIngredientStageLabels[row.stage]}</p>
                  {row.selectedSummary ? <p className="text-xs text-zinc-500">{row.selectedSummary}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => startEditing(row)}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  >
                    Изменить
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRow(row.localId)}
                    className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm text-red-700"
                  >
                    Удалить
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-700">
                <span>Количество: {row.amountEnteredQuantity} {row.amountEnteredUnit}</span>
                <span>Этап: {recipeIngredientStageLabels[row.stage]}</span>
                {row.timeOffset.trim() ? <span>Смещение: {row.timeOffset} мин</span> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
