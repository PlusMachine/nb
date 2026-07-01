import React from "react";
import { evaluateStyleFit, getBeerStyleById, getBjcpStyleDisplayName, getStyleRangeById } from "@nb/brewing-core";
import { CircleAlert, CircleCheck, Gauge, Palette, Percent, Zap } from "lucide-react";

import type { RecipeDetailDto, RecipeListItemDto } from "@/features/recipes/contracts";
import { beerColorFromSrm } from "@/features/recipes/beer-color";
import { resolveRecipeFgHelperText, resolveRecipeFgSourceLabel } from "@/features/recipes/fg-estimate";
import { formatGravity, type PreferredGravityUnit } from "@/features/system/gravity-units";
import { BeerGlassIcon } from "@/components/recipes/beer-glass-icon";

type RecipeStatsSource = Pick<RecipeListItemDto | RecipeDetailDto, "og" | "fg" | "abv" | "ibu" | "color" | "styleId">
  & Partial<Pick<RecipeDetailDto, "fgEstimateMode" | "fgEstimateDetails">>;

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

export function RecipeStatsSummary({
  recipe,
  gravityLabels = { og: "OG", fg: "FG" },
  preferredGravityUnit
}: {
  recipe: RecipeStatsSource;
  gravityLabels?: { og: string; fg: string };
  preferredGravityUnit: PreferredGravityUnit;
}) {
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
  const fgSourceLabel = resolveRecipeFgSourceLabel(recipe.fgEstimateMode, recipe.fgEstimateDetails);
  const fgHelperText = resolveRecipeFgHelperText(recipe.fgEstimateMode, recipe.fg);

  const items = [
    { key: "OG", label: gravityLabels.og, value: formatGravity(recipe.og, preferredGravityUnit), status: fit?.og.status ?? null },
    {
      key: "FG",
      label: gravityLabels.fg,
      value: formatGravity(recipe.fg, preferredGravityUnit),
      status: fit?.fg.status ?? null,
      sourceLabel: recipe.fg != null ? fgSourceLabel : null,
      helperText: recipe.fg == null ? fgHelperText : null
    },
    { key: "ABV", label: "ABV", value: recipe.abv == null ? "—" : `${recipe.abv.toFixed(1)}%`, status: fit?.abv.status ?? null },
    { key: "IBU", label: "IBU", value: recipe.ibu == null ? "—" : `${recipe.ibu.toFixed(0)}`, status: fit?.ibu.status ?? null },
    {
      key: "Color",
      label: "Цвет",
      value: recipe.color == null ? "—" : { srm: recipe.color.toFixed(1), ebc: (recipe.color * 1.97).toFixed(0) },
      status: fit?.colorSrm.status ?? null
    }
  ];

  return (
    <section className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">Ключевые показатели</h2>
          {selectedStyle ? (
            <p className="text-xs text-zinc-500">
              BJCP: {getBjcpStyleDisplayName(selectedStyle)}
              {!styleRange ? " · диапазоны не указаны" : ""}
            </p>
          ) : null}
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
          const isColor = stat.key === "Color";
          const strValue = typeof stat.value === "string" ? stat.value : null;

          return (
            <div
              key={stat.key}
              className="min-w-0 rounded-xl bg-stone-50 p-3"
            >
              <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-zinc-400">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{stat.label}</span>
              </dt>
              {isColor && colorInfo && typeof stat.value === "object" && stat.value !== null ? (
                <dd className="mt-1.5 flex min-w-0 items-center gap-1.5">
                  <BeerGlassIcon color={colorInfo.hex} size={24} className="shrink-0 text-zinc-300" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold tabular-nums text-zinc-950">
                      {(stat.value as { srm: string; ebc: string }).srm}{" "}
                      <span className="text-xs font-medium text-zinc-500">SRM</span>
                      {" / "}
                      {(stat.value as { srm: string; ebc: string }).ebc}{" "}
                      <span className="text-xs font-medium text-zinc-500">EBC</span>
                    </div>
                    <div className="truncate text-xs text-zinc-500">{colorInfo.label}</div>
                  </div>
                </dd>
              ) : (
                <dd className="mt-1.5">
                  <div className="text-lg font-semibold tabular-nums text-zinc-950">
                    {strValue ?? "—"}
                  </div>
                  {"sourceLabel" in stat && stat.sourceLabel ? (
                    <div className="mt-1 text-[11px] font-medium text-zinc-500">{stat.sourceLabel}</div>
                  ) : null}
                  {"helperText" in stat && stat.helperText ? (
                    <div className="mt-1 text-[11px] text-zinc-400">{stat.helperText}</div>
                  ) : null}
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
