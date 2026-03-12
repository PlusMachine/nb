"use client";

import React from "react";

import { getDefaultInventoryUnit } from "@/features/inventory/units";

import { RecipeIngredientRow, type RecipeIngredientEditorRowValue } from "./recipe-ingredient-row";

type Props = {
  rows: RecipeIngredientEditorRowValue[];
  onChange: (rows: RecipeIngredientEditorRowValue[]) => void;
};

const createEmptyRow = (): RecipeIngredientEditorRowValue => ({
  localId: crypto.randomUUID(),
  ingredientCatalogItemId: null,
  userCustomIngredientId: null,
  selectedName: "",
  type: "fermentable",
  amountEnteredQuantity: "",
  amountEnteredUnit: getDefaultInventoryUnit("fermentable"),
  stage: "other",
  timeOffset: ""
});

export function RecipeIngredientsEditor({ rows, onChange }: Props) {
  return (
    <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Ингредиенты</h2>
        <button
          type="button"
          onClick={() => onChange([...rows, createEmptyRow()])}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
        >
          Добавить
        </button>
      </div>

      <div className="space-y-3">
        {rows.map((row, idx) => (
          <RecipeIngredientRow
            key={row.localId}
            value={row}
            onChange={(next) => {
              const nextRows = [...rows];
              nextRows[idx] = next;
              onChange(nextRows);
            }}
            onRemove={() => onChange(rows.filter((candidate) => candidate.localId !== row.localId))}
          />
        ))}
        {!rows.length && <p className="text-sm text-zinc-600">Пока нет ингредиентов. Добавьте хотя бы один для расчета статистики.</p>}
      </div>
    </section>
  );
}
