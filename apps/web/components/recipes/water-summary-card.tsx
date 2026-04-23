"use client";

import React from "react";

import type { RecipeWaterPlanMeta } from "@/features/recipes/contracts";
import type { RecipeWaterPlanResult } from "@/features/recipes/water-plan";

const hasConfiguredWater = (waterPlanMeta: RecipeWaterPlanMeta) => (
  waterPlanMeta.setupEnabled
);

const hasPositiveAcidAddition = (addition: RecipeWaterPlanResult["mashAcidAddition"] | RecipeWaterPlanResult["spargeAcidAddition"]) => (
  Boolean(addition && addition.mashAcidMl > 0)
);

export function WaterSummaryCard({
  waterPlanMeta,
  waterPlanResult
}: {
  waterPlanMeta: RecipeWaterPlanMeta;
  waterPlanResult: RecipeWaterPlanResult;
}) {
  if (!hasConfiguredWater(waterPlanMeta)) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-500">
        Вода не настроена
      </div>
    );
  }

  const ph = waterPlanResult.predictedMashPhAfterAcid20C;
  const hasAdditions = waterPlanResult.totalSaltAdditions.length > 0
    || hasPositiveAcidAddition(waterPlanResult.mashAcidAddition)
    || hasPositiveAcidAddition(waterPlanResult.spargeAcidAddition);
  const isSplit = waterPlanResult.waterVolumes.source === "manual_split";

  return (
    <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-3 text-sm text-sky-900">
      {isSplit
        ? `Затор ${waterPlanResult.waterVolumes.mashWaterL.toFixed(1)} л • промывка ${waterPlanResult.waterVolumes.spargeWaterL.toFixed(1)} л`
        : `Один объем: ${waterPlanResult.waterVolumes.totalWaterL.toFixed(1)} л`}
      {ph != null ? ` • pH ~${ph.toFixed(2)}` : ""}
      {" • "}
      {hasAdditions ? "добавки рассчитаны" : "без добавок"}
    </div>
  );
}
