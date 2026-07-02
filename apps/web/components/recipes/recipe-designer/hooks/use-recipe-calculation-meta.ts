"use client";

import { useState } from "react";

import type { RecipeCalculationMeta, RecipeDetailDto } from "@/features/recipes/contracts";

import { cloneRecipeCalculationMeta } from "../helpers";

// calculationMeta — ручные оверрайды FG/аттенюации и настройки формулы
// горечи, которыми управляют FgSettingsPopover (через
// RecipeBatchParametersBlock) и BitternessSettingsDrawer.
export function useRecipeCalculationMeta({ initialRecipe }: { initialRecipe?: RecipeDetailDto }) {
  const [calculationMeta, setCalculationMeta] = useState<RecipeCalculationMeta>(
    () => cloneRecipeCalculationMeta(initialRecipe?.calculationMeta ?? null)
  );

  return { calculationMeta, setCalculationMeta };
}
