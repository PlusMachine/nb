"use client";

import React from "react";

import type { RecipeWaterPlanMeta } from "@/features/recipes/contracts";
import type { RecipeWaterPlanResult } from "@/features/recipes/water-plan";

const hasConfiguredWater = (waterPlanMeta: RecipeWaterPlanMeta) => (
  waterPlanMeta.setupEnabled
  || Boolean(waterPlanMeta.sourceProfile)
  || Boolean(waterPlanMeta.targetProfile)
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
        Водоподготовка не настроена
      </div>
    );
  }

  const ph = waterPlanResult.predictedMashPhAfterAcid20C;
  const hasAdditions = waterPlanResult.totalSaltAdditions.length > 0 || Boolean(waterPlanResult.mashAcidAddition || waterPlanResult.spargeAcidAddition);

  return (
    <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-3 text-sm text-sky-900">
      Затор {waterPlanResult.waterVolumes.mashWaterL.toFixed(1)} л
      {" • "}
      промывка {waterPlanResult.waterVolumes.spargeWaterL.toFixed(1)} л
      {" • "}
      pH {ph != null ? `~${ph.toFixed(2)}` : "не рассчитан"}
      {" • "}
      {hasAdditions ? "добавки рассчитаны" : "без добавок"}
    </div>
  );
}
