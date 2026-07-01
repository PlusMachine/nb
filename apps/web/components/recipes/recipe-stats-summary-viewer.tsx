"use client";

import React, { useEffect, useState } from "react";

import type { RecipeDetailDto, RecipeListItemDto } from "@/features/recipes/contracts";
import { loadViewerPreferredGravityUnit } from "@/features/system/gravity-unit-actions";
import { defaultPreferredGravityUnit } from "@/features/system/gravity-units";

import { RecipeStatsSummary } from "./recipe-stats-summary";

type RecipeStatsSource = Pick<RecipeListItemDto | RecipeDetailDto, "og" | "fg" | "abv" | "ibu" | "color" | "styleId">
  & Partial<Pick<RecipeDetailDto, "fgEstimateMode" | "fgEstimateDetails">>;

/**
 * Обёртка для страниц, которые намеренно не читают сессию на сервере (ISR/SSG для
 * анонимов) — единица плотности догружается на клиенте после гидрации, как
 * {@link RecipeRatingForm}. До ответа сервера показывается дефолт (Plato).
 */
export function RecipeStatsSummaryViewer({ recipe }: { recipe: RecipeStatsSource }) {
  const [preferredGravityUnit, setPreferredGravityUnit] = useState(defaultPreferredGravityUnit);

  useEffect(() => {
    let active = true;
    loadViewerPreferredGravityUnit()
      .then((unit) => {
        if (active) {
          setPreferredGravityUnit(unit);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return <RecipeStatsSummary recipe={recipe} preferredGravityUnit={preferredGravityUnit} />;
}
