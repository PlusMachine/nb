import React from "react";
import type { RecipeDetailDto, RecipeListItemDto } from "@/features/recipes/contracts";

type RecipeStatsSource = Pick<RecipeListItemDto | RecipeDetailDto, "og" | "fg" | "abv" | "ibu" | "color">;

const formatStat = (label: string, value: number | null, precision = 3) => ({
  label,
  value: value === null ? "—" : value.toFixed(precision)
});

export function RecipeStatsSummary({ recipe }: { recipe: RecipeStatsSource }) {
  const stats = [
    formatStat("OG", recipe.og),
    formatStat("FG", recipe.fg),
    formatStat("ABV", recipe.abv, 1),
    formatStat("IBU", recipe.ibu, 0),
    formatStat("Color", recipe.color, 1)
  ];

  return (
    <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <h2 className="mb-2 text-sm font-medium text-zinc-700">Ключевые показатели</h2>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-md bg-white p-2 text-center">
            <dt className="text-xs text-zinc-500">{stat.label}</dt>
            <dd className="text-sm font-semibold text-zinc-900">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
