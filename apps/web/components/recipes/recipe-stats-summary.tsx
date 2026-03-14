import React from "react";
import type { RecipeDetailDto, RecipeListItemDto } from "@/features/recipes/contracts";
import { formatColorWithEbc, formatGravityWithPlato } from "@/features/recipes/format";

type RecipeStatsSource = Pick<RecipeListItemDto | RecipeDetailDto, "og" | "fg" | "abv" | "ibu" | "color">;

export function RecipeStatsSummary({ recipe }: { recipe: RecipeStatsSource }) {
  const stats = [
    { label: "OG", value: formatGravityWithPlato(recipe.og) },
    { label: "FG", value: formatGravityWithPlato(recipe.fg) },
    { label: "ABV", value: recipe.abv == null ? "—" : `${recipe.abv.toFixed(1)}%` },
    { label: "IBU", value: recipe.ibu == null ? "—" : `${recipe.ibu.toFixed(0)} IBU` },
    { label: "Color", value: formatColorWithEbc(recipe.color) }
  ];

  return (
    <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900">Ключевые показатели</h2>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl bg-white p-3">
            <dt className="text-xs uppercase tracking-[0.12em] text-zinc-500">{stat.label}</dt>
            <dd className="mt-1 text-sm font-semibold text-zinc-900">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
