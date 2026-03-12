import React from "react";

import type { RecipeDetailDto } from "@/features/recipes/contracts";

import { RecipeStatsSummary } from "./recipe-stats-summary";

export function RecipeStatsPreview({ recipe }: { recipe: Pick<RecipeDetailDto, "og" | "fg" | "abv" | "ibu" | "color" | "batchSizeEnteredQuantity" | "batchSizeEnteredUnit"> | null }) {
  return (
    <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4" data-testid="recipe-stats-preview">
      <h2 className="text-base font-semibold">Предпросмотр статистики</h2>
      <p className="text-sm text-zinc-600">Объём партии: {recipe ? `${recipe.batchSizeEnteredQuantity} ${recipe.batchSizeEnteredUnit}` : "—"}</p>
      <RecipeStatsSummary recipe={recipe ?? { og: null, fg: null, abv: null, ibu: null, color: null }} />
    </section>
  );
}
