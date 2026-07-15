import React from "react";

import type { RecipeDetailDto } from "@/features/recipes/contracts";
import { inventoryUnitLabels } from "@/features/inventory/units";
import { defaultPreferredGravityUnit, type PreferredGravityUnit } from "@/features/system/gravity-units";

import { RecipeStatsSummary } from "./recipe-stats-summary";

export function RecipeStatsPreview({
  recipe,
  preferredGravityUnit = defaultPreferredGravityUnit
}: {
  recipe: Pick<RecipeDetailDto, "og" | "fg" | "abv" | "ibu" | "color" | "batchSizeEnteredQuantity" | "batchSizeEnteredUnit" | "styleId"> | null;
  preferredGravityUnit?: PreferredGravityUnit;
}) {
  return (
    <section className="space-y-2 rounded-2xl border border-border bg-card p-5 shadow-sm" data-testid="recipe-stats-preview">
      <h2 className="text-base font-semibold text-foreground">Предпросмотр статистики</h2>
      <p className="text-sm text-muted-foreground">Объём партии: {recipe ? `${recipe.batchSizeEnteredQuantity} ${inventoryUnitLabels[recipe.batchSizeEnteredUnit] ?? recipe.batchSizeEnteredUnit}` : "—"}</p>
      <RecipeStatsSummary
        recipe={recipe ?? {
          og: null,
          fg: null,
          fgEstimateMode: "unavailable",
          fgEstimateDetails: null,
          abv: null,
          ibu: null,
          color: null,
          styleId: null
        }}
        gravityLabels={{ og: "НП", fg: "КП" }}
        preferredGravityUnit={preferredGravityUnit}
      />
    </section>
  );
}
