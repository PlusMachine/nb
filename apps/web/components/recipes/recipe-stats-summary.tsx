import React from "react";
import { evaluateStyleFit, styleRangeFixtures } from "@nb/brewing-core";
import { CircleCheck, CircleAlert, Gauge, Palette, Percent, Target, Zap } from "lucide-react";
import type { RecipeDetailDto, RecipeListItemDto } from "@/features/recipes/contracts";
import { formatColorWithEbc, formatGravityWithPlato } from "@/features/recipes/format";
import { globalBrewingRanges } from "@/features/recipes/style-ranges";

type RecipeStatsSource = Pick<RecipeListItemDto | RecipeDetailDto, "og" | "fg" | "abv" | "ibu" | "color" | "styleId">;

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const getPositionPercent = (value: number | null, min: number, max: number) => {
  if (value == null || max <= min) return null;
  return clampPercent(((value - min) / (max - min)) * 100);
};

const statusAppearance = (status: "in_range" | "below" | "above" | null) => {
  if (status === "in_range") return { label: "В стиле", badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200", needle: "bg-emerald-500", dot: "bg-emerald-500 ring-2 ring-white shadow" };
  if (status === "below") return { label: "Ниже", badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200", needle: "bg-amber-500", dot: "bg-amber-500 ring-2 ring-white shadow" };
  if (status === "above") return { label: "Выше", badge: "bg-rose-50 text-rose-700 ring-1 ring-rose-200", needle: "bg-rose-500", dot: "bg-rose-500 ring-2 ring-white shadow" };
  return { label: "—", badge: "bg-zinc-50 text-zinc-500 ring-1 ring-zinc-200", needle: "bg-zinc-400", dot: "bg-zinc-400 ring-2 ring-white shadow" };
};

const metricIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  OG: Gauge,
  FG: Gauge,
  ABV: Percent,
  IBU: Zap,
  Color: Palette
};

export function RecipeStatsSummary({ recipe }: { recipe: RecipeStatsSource }) {
  const styleRange = recipe.styleId ? styleRangeFixtures.find((s) => s.id === recipe.styleId) ?? null : null;
  const hasValues = [recipe.og, recipe.fg, recipe.abv, recipe.ibu, recipe.color].some((v) => v != null);
  const fit = styleRange && recipe.og != null && recipe.fg != null && recipe.abv != null && recipe.ibu != null && recipe.color != null
    ? evaluateStyleFit(styleRange, { og: recipe.og, fg: recipe.fg, abv: recipe.abv, ibu: recipe.ibu, srm: recipe.color })
    : null;
  const overallFit = fit?.overallFit ?? false;

  const items = [
    { key: "OG", label: "OG", value: formatGravityWithPlato(recipe.og), actual: recipe.og, global: globalBrewingRanges.og, style: styleRange?.og ?? null, status: fit?.og.status ?? null },
    { key: "FG", label: "FG", value: formatGravityWithPlato(recipe.fg), actual: recipe.fg, global: globalBrewingRanges.fg, style: styleRange?.fg ?? null, status: fit?.fg.status ?? null },
    { key: "ABV", label: "ABV", value: recipe.abv == null ? "—" : `${recipe.abv.toFixed(1)}%`, actual: recipe.abv, global: globalBrewingRanges.abv, style: styleRange?.abv ?? null, status: fit?.abv.status ?? null },
    { key: "IBU", label: "IBU", value: recipe.ibu == null ? "—" : `${recipe.ibu.toFixed(0)}`, actual: recipe.ibu, global: globalBrewingRanges.ibu, style: styleRange?.ibu ?? null, status: fit?.ibu.status ?? null },
    { key: "Color", label: "Color", value: formatColorWithEbc(recipe.color), actual: recipe.color, global: globalBrewingRanges.colorSrm, style: styleRange?.colorSrm ?? null, status: fit?.colorSrm.status ?? null }
  ];

  if (!styleRange) {
    return (
      <section className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-zinc-950">Ключевые показатели</h2>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {items.map((stat) => {
            const Icon = metricIcons[stat.key];
            return (
              <div key={stat.key} className="rounded-xl bg-zinc-50 p-3">
                <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-zinc-400">
                  <Icon className="h-3.5 w-3.5" />
                  {stat.label}
                </dt>
                <dd className="mt-1.5 text-lg font-semibold tabular-nums text-zinc-950">{stat.value}</dd>
              </div>
            );
          })}
        </dl>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100">
            <Target className="h-4 w-4 text-zinc-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-950">Соответствие стилю</h2>
            <p className="text-xs text-zinc-500">{styleRange.name}</p>
          </div>
        </div>
        {hasValues ? (
          <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${overallFit ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"}`}>
            {overallFit ? <CircleCheck className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
            {overallFit ? "Всё в стиле" : "Есть отклонения"}
          </span>
        ) : null}
      </div>

      <div className="space-y-1">
        {items.map((item) => {
          const appearance = statusAppearance(item.status);
          const valuePercent = getPositionPercent(item.actual, item.global.min, item.global.max);
          const bandLeft = item.style ? clampPercent(((item.style.min - item.global.min) / (item.global.max - item.global.min)) * 100) : null;
          const bandRight = item.style ? clampPercent(((item.style.max - item.global.min) / (item.global.max - item.global.min)) * 100) : null;
          const bandWidth = bandLeft != null && bandRight != null ? bandRight - bandLeft : null;

          return (
            <div key={item.key} className="grid items-center gap-x-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-zinc-50 sm:grid-cols-[48px_100px_minmax(0,1fr)_auto]">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">{item.label}</div>
              <div className="text-sm font-semibold tabular-nums text-zinc-950">{item.value}</div>
              <div className="mt-1 sm:mt-0">
                {valuePercent == null ? (
                  <div className="flex h-5 items-center text-[11px] text-zinc-400">Нет данных</div>
                ) : (
                  <div className="relative h-5 w-full rounded-lg bg-zinc-100">
                    {bandLeft != null && bandWidth != null && (
                      <div className="absolute inset-y-0 rounded-md bg-emerald-500/[.12] ring-1 ring-inset ring-emerald-500/20" style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }} />
                    )}
                    <div className={`absolute top-0 h-full w-[2px] -translate-x-[1px] ${appearance.needle}`} style={{ left: `${valuePercent}%` }} />
                    <div className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${appearance.dot}`} style={{ left: `${valuePercent}%` }} />
                  </div>
                )}
              </div>
              <div className="mt-1 sm:mt-0">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${appearance.badge}`}>{appearance.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
