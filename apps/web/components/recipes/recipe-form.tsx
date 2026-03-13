"use client";

import React from "react";
import Link from "next/link";
import { useState } from "react";

import { createRecipeAction, updateRecipeAction, type RecipeEditorResult } from "@/app/(app)/app/recipes/actions";
import { resolveIngredientCategory } from "@/features/ingredients/taxonomy";
import type { RecipeDetailDto, RecipePublicationState } from "@/features/recipes/contracts";

import { RecipeBatchSizeFields } from "./recipe-batch-size-fields";
import { RecipeEditorErrorState } from "./recipe-editor-error-state";
import { RecipeIngredientsEditor } from "./recipe-ingredients-editor";
import type { RecipeIngredientEditorRowValue } from "./recipe-ingredient-row";
import { RecipeMetaFields } from "./recipe-meta-fields";
import { RecipeStatsPreview } from "./recipe-stats-preview";

type Props = {
  mode: "create" | "edit";
  initialRecipe?: RecipeDetailDto;
};

const toIngredientRow = (ingredient: RecipeDetailDto["ingredients"][number]): RecipeIngredientEditorRowValue => ({
  localId: ingredient.id,
  ingredientCatalogItemId: ingredient.ingredientCatalogItemId,
  userCustomIngredientId: ingredient.userCustomIngredientId,
  selectedName: ingredient.ingredientDisplayName ?? "",
  selectedSummary: ingredient.ingredientSummary ?? "",
  familyDisplayName: ingredient.ingredientFamilyDisplayName ?? "",
  category: ingredient.ingredientCategory ?? resolveIngredientCategory({ type: ingredient.type }),
  subtype: ingredient.ingredientSubtype ?? null,
  familyId: ingredient.ingredientFamilyId ?? null,
  type: ingredient.type,
  defaultDisplayUnit: ingredient.ingredientDefaultDisplayUnit ?? ingredient.amountEnteredUnit,
  allowedUnits: ingredient.ingredientAllowedUnits ?? [ingredient.amountEnteredUnit],
  measurementDimension: ingredient.ingredientMeasurementDimension ?? null,
  amountEnteredQuantity: String(ingredient.amountEnteredQuantity),
  amountEnteredUnit: ingredient.amountEnteredUnit,
  stage: ingredient.stage,
  timeOffset: ingredient.timeOffset === null ? "" : String(ingredient.timeOffset)
});

export function RecipeForm({ mode, initialRecipe }: Props) {
  const [meta, setMeta] = useState<{
    title: string;
    description: string;
    authorNotes: string;
    publicationState: RecipePublicationState;
    efficiency: string;
  }>({
    title: initialRecipe?.title ?? "",
    description: initialRecipe?.description ?? "",
    authorNotes: initialRecipe?.authorNotes ?? "",
    publicationState: initialRecipe?.publicationState ?? "draft",
    efficiency: initialRecipe?.efficiency ? String(initialRecipe.efficiency) : ""
  });
  const [batchSize, setBatchSize] = useState<{ quantity: string; unit: string }>({
    quantity: initialRecipe ? String(initialRecipe.batchSizeEnteredQuantity) : "20",
    unit: initialRecipe?.batchSizeEnteredUnit ?? "l"
  });
  const [ingredientRows, setIngredientRows] = useState<RecipeIngredientEditorRowValue[]>(
    initialRecipe?.ingredients.map(toIngredientRow) ?? []
  );

  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<RecipeEditorResult | null>(null);
  const [statsRecipe, setStatsRecipe] = useState<RecipeDetailDto | null>(initialRecipe ?? null);

  const handleSubmit = async () => {
    setPending(true);
    const payload = {
      title: meta.title,
      description: meta.description.trim() || null,
      authorNotes: meta.authorNotes.trim() || null,
      publicationState: meta.publicationState,
      batchSizeEnteredQuantity: Number(batchSize.quantity),
      batchSizeEnteredUnit: batchSize.unit,
      efficiency: meta.efficiency.trim() ? Number(meta.efficiency) : null,
      ingredients: ingredientRows.map((row) => ({
        ingredientCatalogItemId: row.ingredientCatalogItemId,
        userCustomIngredientId: row.userCustomIngredientId,
        type: row.type,
        category: row.category,
        subtype: row.subtype,
        familyId: row.familyId,
        amountEnteredQuantity: Number(row.amountEnteredQuantity),
        amountEnteredUnit: row.amountEnteredUnit,
        stage: row.stage,
        timeOffset: row.timeOffset.trim() ? Number(row.timeOffset) : null
      }))
    };

    const nextResult = mode === "create"
      ? await createRecipeAction(payload)
      : await updateRecipeAction(initialRecipe!.id, payload);

    setResult(nextResult);
    if (nextResult.ok && nextResult.recipe) {
      setStatsRecipe(nextResult.recipe);
    }
    setPending(false);
  };

  return (
    <div className="space-y-4">
      {result && !result.ok && <RecipeEditorErrorState message={result.message} />}
      {result?.ok && <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{result.message}</p>}

      <RecipeMetaFields value={meta} onChange={(patch) => setMeta((current) => ({ ...current, ...patch }))} fieldErrors={result?.fieldErrors} />
      <RecipeBatchSizeFields
        quantity={batchSize.quantity}
        unit={batchSize.unit}
        onChange={(patch) => setBatchSize((current) => ({ ...current, ...patch }))}
      />
      <RecipeIngredientsEditor rows={ingredientRows} onChange={setIngredientRows} />
      <RecipeStatsPreview recipe={statsRecipe} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => void handleSubmit()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Сохраняем…" : mode === "create" ? "Создать рецепт" : "Сохранить изменения"}
        </button>
        {result?.recipe && (
          <Link href={`/app/recipes/${result.recipe.id}`} className="text-sm text-blue-700 underline">
            Открыть рецепт
          </Link>
        )}
      </div>
    </div>
  );
}
