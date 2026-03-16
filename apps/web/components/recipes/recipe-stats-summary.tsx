import React from "react";
import { evaluateStyleFit, getBeerStyleById, getStyleRangeById } from "@nb/brewing-core";
import { CircleAlert, CircleCheck, Gauge, Palette, Percent, Zap } from "lucide-react";

import type { RecipeDetailDto, RecipeListItemDto } from "@/features/recipes/contracts";
import { beerColorFromSrm } from "@/features/recipes/beer-color";
import { formatColorWithEbc, formatGravityWithPlato } from "@/features/recipes/format";
import { BeerGlassIcon } from "@/components/recipes/beer-glass-icon";

type RecipeStatsSource = Pick<RecipeListItemDto | RecipeDetailDto, "og" | "fg" | "abv" | "ibu" | "color" | "styleId">;

const metricIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  OG: Gauge,
  FG: Gauge,
  ABV: Percent,
  IBU: Zap,
  Color: Palette
};

const metricStatusLabels: Record<"in_range" | "below" | "above", string> = {
  in_range: "В стиле",
  below: "Ниже",
  above: "Выше"
};

export function RecipeStatsSummary({ recipe }: { recipe: RecipeStatsSource }) {
  const selectedStyle = getBeerStyleById(recipe.styleId);
  const styleRange = getStyleRangeById(recipe.styleId);
  const fit = styleRange && recipe.og != null && recipe.fg != null && recipe.abv != null && recipe.ibu != null && recipe.color != null
    ? evaluateStyleFit(styleRange, {
      og: recipe.og,
      fg: recipe.fg,
      abv: recipe.abv,
      ibu: recipe.ibu,
      srm: recipe.color
    })
    : null;
  const hasValues = [recipe.og, recipe.fg, recipe.abv, recipe.ibu, recipe.color].some((value) => value != null);
  const overallFit = fit?.overallFit ?? false;

  const items = [
    { key: "OG", label: "OG", value: formatGravityWithPlato(recipe.og), status: fit?.og.status ?? null },
    { key: "FG", label: "FG", value: formatGravityWithPlato(recipe.fg), status: fit?.fg.status ?? null },
    { key: "ABV", label: "ABV", value: recipe.abv == null ? "—" : `${recipe.abv.toFixed(1)}%`, status: fit?.abv.status ?? null },
    { key: "IBU", label: "IBU", value: recipe.ibu == null ? "—" : `${recipe.ibu.toFixed(0)}`, status: fit?.ibu.status ?? null },
    { key: "Color", label: "Color", value: formatColorWithEbc(recipe.color), status: fit?.colorSrm.status ?? null }
  ];

  return (
    <section className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">Ключевые показатели</h2>
          {selectedStyle ? <p className="text-xs text-zinc-500">BJCP: {selectedStyle.name}</p> : null}
        </div>
        {styleRange && hasValues ? (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${overallFit ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"}`}>
            {overallFit ? <CircleCheck className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
            {overallFit ? "В стиле" : "Есть отклонения"}
          </span>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {items.map((stat) => {
          const Icon = metricIcons[stat.key];
          const colorInfo = stat.key === "Color" && recipe.color != null ? beerColorFromSrm(recipe.color) : null;

          return (
            <div
              key={stat.key}
              className="rounded-xl bg-stone-50 p-3"
            >
              <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-zinc-400">
                <Icon className="h-3.5 w-3.5" />
                {stat.label}
              </dt>
              {colorInfo ? (
                <dd className="mt-1.5 flex items-center gap-2">
                  <BeerGlassIcon color={colorInfo.hex} size={28} className="shrink-0 text-zinc-300" />
                  <div>
                    <div className="whitespace-nowrap text-lg font-semibold tabular-nums text-zinc-950">{stat.value}</div>
                    <div className="text-[10px] font-medium text-zinc-400">{colorInfo.label}</div>
                  </div>
                </dd>
              ) : (
                <dd className="mt-1.5 whitespace-nowrap text-lg font-semibold tabular-nums text-zinc-950">
                  {stat.value}
                </dd>
              )}
              {stat.status ? (
                <div className="mt-1.5 text-[11px] font-medium text-zinc-500">
                  {metricStatusLabels[stat.status]}
                </div>
              ) : null}
            </div>
          );
        })}
      </dl>
    </section>
  );
}
