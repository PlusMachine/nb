"use client";

import { useEffect, useRef, useState } from "react";

import type {
  IngredientCategory,
  IngredientSuggestionItem
} from "@/features/ingredients/contracts";
import { resolveIngredientCategory } from "@/features/ingredients/taxonomy";
import type { RecipeDetailDto, RecipeHopUseType } from "@/features/recipes/contracts";

import {
  applySelection,
  createEmptyIngredient,
  resolveRecipeFermentableSubtype,
  serializeIngredient,
  toDesignerIngredient,
  type DesignerIngredient,
  type OpenEditorState
} from "../helpers";

// Стейт списка ингредиентов рецепта + драфт-редактор одной позиции
// (`openEditor`). Комбинированное «сохранить редактор» для водоподготовки
// (кросс-режет с water-plan) и «сохранить импортированный ингредиент как
// custom» (кросс-режет с pendingSave/saveResult автосейва) остаются в
// recipe-designer.tsx — это orchestration поверх нескольких доменов, а не
// часть состояния списка ингредиентов как такового.
export function useRecipeIngredients({
  initialRecipe,
  initialIngredientSelection = null,
  boilTimeMinutes,
  onIngredientDeleted
}: {
  initialRecipe?: RecipeDetailDto;
  initialIngredientSelection?: IngredientSuggestionItem | null;
  /** Время кипячения рецепта — им предзаполняется поле «мин» у хмеля на кипячение. */
  boilTimeMinutes: number;
  onIngredientDeleted?: (payload: { ingredient: DesignerIngredient; index: number }) => void;
}) {
  const [ingredients, setIngredients] = useState<DesignerIngredient[]>(
    initialRecipe?.ingredients.map(toDesignerIngredient) ?? []
  );
  const [openEditor, setOpenEditor] = useState<OpenEditorState | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const initialSelectionAppliedRef = useRef(false);

  useEffect(() => {
    if (initialSelectionAppliedRef.current || !initialIngredientSelection || initialRecipe) {
      return;
    }

    const selectionCategory = initialIngredientSelection.category
      ?? resolveIngredientCategory({ type: initialIngredientSelection.type });
    const draft = applySelection(
      createEmptyIngredient(
        selectionCategory,
        "boil",
        resolveRecipeFermentableSubtype(selectionCategory, initialIngredientSelection.subtype ?? null),
        boilTimeMinutes
      ),
      initialIngredientSelection
    );
    initialSelectionAppliedRef.current = true;
    setOpenEditor({
      localId: null,
      category: selectionCategory,
      draft,
      initialSignature: serializeIngredient(draft),
      isExisting: false
    });
  }, [boilTimeMinutes, initialIngredientSelection, initialRecipe]);

  const maybeOpenEditor = (next: OpenEditorState) => {
    setOpenEditor(next);
  };

  const closeEditor = () => {
    if (!openEditor) {
      return;
    }

    setOpenEditor(null);
  };

  // Пользовательские пути закрытия (Escape / клик мимо / «Отмена» / крестик)
  // идут через этот guard, а не через closeEditor напрямую: несохранённый
  // драфт не должен теряться молча.
  const requestCloseEditor = () => {
    if (!openEditor) {
      return;
    }

    if (serializeIngredient(openEditor.draft) !== openEditor.initialSignature) {
      setCloseConfirmOpen(true);
      return;
    }

    setOpenEditor(null);
  };

  const confirmCloseEditor = () => {
    setOpenEditor(null);
    setCloseConfirmOpen(false);
  };

  const cancelCloseEditor = () => {
    setCloseConfirmOpen(false);
  };

  const openAddEditor = (category: IngredientCategory, hopUseType: RecipeHopUseType = "boil") => {
    const baseDraft = createEmptyIngredient(
      category,
      hopUseType,
      null,
      boilTimeMinutes
    );
    const draft = category === "water_treatment"
      ? {
          ...baseDraft,
          inventoryIntentMode: "catalog" as const,
          inventorySelectionMeta: null,
        }
      : baseDraft;
    maybeOpenEditor({
      localId: null,
      category,
      draft,
      initialSignature: serializeIngredient(draft),
      isExisting: false
    });
  };

  const deleteIngredient = (localId: string) => {
    const index = ingredients.findIndex((ingredient) => ingredient.localId === localId);
    if (index === -1) {
      return;
    }

    const ingredient = ingredients[index];
    setIngredients((current) => current.filter((item) => item.localId !== localId));
    if (openEditor?.localId === localId) {
      setOpenEditor(null);
    }
    onIngredientDeleted?.({ ingredient, index });
  };

  // Undo для deleteIngredient: вставляет ту же позицию обратно на её прежнее
  // место (или в конец, если список с тех пор укоротился).
  const restoreIngredient = (ingredient: DesignerIngredient, index: number) => {
    setIngredients((current) => {
      const insertAt = Math.min(index, current.length);
      return [...current.slice(0, insertAt), ingredient, ...current.slice(insertAt)];
    });
  };

  const openImportedCatalogMatcher = (ingredient: DesignerIngredient) => {
    const draft = {
      ...ingredient,
      inventoryIntentMode: "catalog" as const,
      inventorySelectionMeta: null
    };
    maybeOpenEditor({
      localId: ingredient.localId,
      category: ingredient.category,
      draft,
      initialSignature: serializeIngredient(draft),
      isExisting: true
    });
  };

  const updateIngredientQuantity = (localId: string, quantity: string) => {
    setIngredients((current) =>
      current.map((ingredient) => ingredient.localId === localId ? { ...ingredient, amountEnteredQuantity: quantity } : ingredient)
    );
  };

  const updateHopTimeMinutes = (localId: string, timeMinutes: string) => {
    setIngredients((current) =>
      current.map((ingredient) => {
        if (ingredient.localId !== localId || ingredient.category !== "hop") {
          return ingredient;
        }

        return {
          ...ingredient,
          timeOffset: timeMinutes,
          stepMeta: {
            ...ingredient.stepMeta,
            timeMinutes
          }
        };
      })
    );
  };

  return {
    ingredients,
    setIngredients,
    openEditor,
    setOpenEditor,
    maybeOpenEditor,
    closeEditor,
    closeConfirmOpen,
    requestCloseEditor,
    confirmCloseEditor,
    cancelCloseEditor,
    openAddEditor,
    deleteIngredient,
    restoreIngredient,
    openImportedCatalogMatcher,
    updateIngredientQuantity,
    updateHopTimeMinutes
  };
}
