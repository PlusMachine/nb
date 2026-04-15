"use client";

import React, { useCallback, useState } from "react";

import type { EquipmentProfileDto } from "@/features/equipment-profiles/contracts";
import type { IngredientSuggestionItem } from "@/features/ingredients/contracts";
import type { RecipeDetailDto, RecipePublicationState, RecipeStockCoverageDto } from "@/features/recipes/contracts";

import type { RecipeSaveStatus } from "./recipe-designer";
import { RecipeForm } from "./recipe-form";

export function RecipeEditorPage({
  mode,
  recipe,
  initialTitle,
  initialIngredientSelection,
  initialStockCoverage,
  equipmentProfiles = []
}: {
  mode: "create" | "edit";
  recipe?: RecipeDetailDto;
  initialTitle?: string;
  initialIngredientSelection?: IngredientSuggestionItem | null;
  initialStockCoverage?: RecipeStockCoverageDto | null;
  equipmentProfiles?: EquipmentProfileDto[];
}) {
  const [saveStatus, setSaveStatus] = useState<RecipeSaveStatus>("saved");
  const [editorMode, setEditorMode] = useState<"create" | "edit">(mode);
  const [publicationState, setPublicationState] = useState<RecipePublicationState>(recipe?.publicationState === "published" ? "published" : "private");
  const handleRecipeCreated = useCallback(() => {
    setEditorMode("edit");
  }, []);

  const saveStatusAppearance = saveStatus === "saving"
    ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
    : saveStatus === "error"
      ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
      : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  const saveStatusLabel = saveStatus === "saving"
    ? "Сохраняем..."
    : saveStatus === "error"
      ? "Не сохранено"
      : "Сохранено";
  const visibilityBadgeClassName = publicationState === "published"
    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
    : "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200";
  const visibilityLabel = publicationState === "published" ? "Публичный рецепт" : "Приватный рецепт";

  return (
    <main className="space-y-5">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <span className={`inline-flex h-7 items-center rounded-full px-3 text-xs font-medium ${visibilityBadgeClassName}`}>
            {visibilityLabel}
          </span>
        </div>
        <div className="flex justify-start lg:justify-end">
          <div className="space-y-1 text-left lg:text-right">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${saveStatusAppearance}`}>
              {saveStatusLabel}
            </span>
            <p className="text-[11px] text-zinc-500">Автосохранение</p>
          </div>
        </div>
      </section>
      <RecipeForm
        mode={editorMode}
        initialRecipe={recipe}
        initialTitle={initialTitle}
        initialIngredientSelection={initialIngredientSelection}
        initialStockCoverage={initialStockCoverage}
        equipmentProfiles={equipmentProfiles}
        onSaveStatusChange={setSaveStatus}
        onRecipeCreated={handleRecipeCreated}
        onPublicationStateChange={setPublicationState}
      />
    </main>
  );
}
