"use client";

import React from "react";

import type { RecipeDetailDto, RecipeListItemDto } from "@/features/recipes/contracts";
import { useViewerGravityUnit } from "@/features/system/use-viewer-gravity-unit";

import { RecipeStatsSummary } from "./recipe-stats-summary";

type RecipeStatsSource = Pick<RecipeListItemDto | RecipeDetailDto, "og" | "fg" | "abv" | "ibu" | "color" | "styleId">
  & Partial<Pick<RecipeDetailDto, "fgEstimateMode" | "fgEstimateDetails">>;

/**
 * Обёртка для страниц, которые намеренно не читают сессию на сервере (ISR/SSG для
 * анонимов) — единица плотности догружается на клиенте после гидрации, см.
 * {@link useViewerGravityUnit}. До ответа сервера показывается дефолт (Plato).
 */
export function RecipeStatsSummaryViewer({ recipe }: { recipe: RecipeStatsSource }) {
  const { unit: preferredGravityUnit } = useViewerGravityUnit();

  return <RecipeStatsSummary recipe={recipe} preferredGravityUnit={preferredGravityUnit} />;
}
