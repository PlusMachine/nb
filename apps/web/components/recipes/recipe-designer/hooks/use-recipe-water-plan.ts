"use client";

import React, { useState } from "react";

import type { RecipeDetailDto, RecipeWaterManualSaltAdditionTarget, RecipeWaterPlanMeta } from "@/features/recipes/contracts";
import {
  createRecipeWaterPlanResetMeta,
  removeRecipeWaterManualSaltAddition
} from "@/components/recipes/water-setup-wizard";

import { cloneRecipeWaterPlanMeta } from "../helpers";

// Water-plan мета (источник/цель воды, соли, кислоты) + состояние мастера
// водоподготовки (открыт/закрыт, подтверждение сброса). Производные значения
// (waterPlanResult, calculatedWaterPlanResult, computedWaterAdditiveCount)
// остаются в recipe-designer.tsx — они завязаны на ingredients/equipment/preview
// из других доменов и пересчитываются там же, где эти данные сходятся.
export function useRecipeWaterPlan({ initialRecipe }: { initialRecipe?: RecipeDetailDto }) {
  const [waterPlanMeta, setWaterPlanMeta] = useState<RecipeWaterPlanMeta>(
    () => cloneRecipeWaterPlanMeta(initialRecipe?.waterPlanMeta ?? null)
  );
  const [waterSetupOpen, setWaterSetupOpen] = useState(false);
  const [waterResetConfirmOpen, setWaterResetConfirmOpen] = useState(false);

  const openWaterSetup = React.useCallback(() => {
    setWaterSetupOpen(true);
  }, []);
  const closeWaterSetup = React.useCallback(() => {
    setWaterSetupOpen(false);
  }, []);
  const resetWaterSetup = React.useCallback(() => {
    setWaterPlanMeta(createRecipeWaterPlanResetMeta());
    setWaterSetupOpen(false);
  }, []);
  const updateRecipeWaterManualSalt = React.useCallback((
    index: number,
    patch: Partial<{
      grams: number;
      target: RecipeWaterManualSaltAdditionTarget;
    }>
  ) => {
    setWaterPlanMeta((current) => {
      const next = [...(current.manualSaltAdditions ?? [])];
      const item = next[index];
      if (!item) {
        return current;
      }

      next[index] = {
        ...item,
        ...patch,
        grams:
          patch.grams == null
            ? item.grams
            : Number.isFinite(patch.grams)
              ? Math.max(0, patch.grams)
              : 0
      };

      return {
        ...current,
        setupEnabled: true,
        engine: "advanced_manual",
        manualSaltAdditions: next
      };
    });
  }, []);
  const removeManualSaltAddition = React.useCallback((index: number) => {
    setWaterPlanMeta((current) => removeRecipeWaterManualSaltAddition(current, index));
  }, []);
  const applyAcidConcentration = React.useCallback((concentrationPct: number) => {
    setWaterPlanMeta((current) => ({
      ...current,
      acidConcentrationPct: concentrationPct
    }));
  }, []);

  return {
    waterPlanMeta,
    setWaterPlanMeta,
    waterSetupOpen,
    setWaterSetupOpen,
    waterResetConfirmOpen,
    setWaterResetConfirmOpen,
    openWaterSetup,
    closeWaterSetup,
    resetWaterSetup,
    updateRecipeWaterManualSalt,
    removeManualSaltAddition,
    applyAcidConcentration
  };
}
