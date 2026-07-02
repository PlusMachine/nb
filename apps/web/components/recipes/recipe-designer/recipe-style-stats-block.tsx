"use client";

import { getBeerStyleById, getBjcpArticleHrefByStyleId, getBjcpStyleDisplayName } from "@nb/brewing-core";
import { CircleCheck, CircleAlert, ExternalLink, Loader2 } from "lucide-react";
import React from "react";

import { type RecipeDraftPreviewDto } from "@/features/recipes/contracts";
import { formatColorWithEbc } from "@/features/recipes/format";
import { formatGravity, type PreferredGravityUnit } from "@/features/system/gravity-units";
import { globalBrewingRanges } from "@/features/recipes/style-ranges";

import { getMetricStatusAppearance } from "./helpers";
import { StyleRangeTrack } from "./style-range-track";

const getRangeStatus = (
  actualValue: number | null,
  styleRange: { min: number; max: number } | null
): "in_range" | "below" | "above" | null => {
  if (actualValue == null || !styleRange) {
    return null;
  }
  if (actualValue < styleRange.min) {
    return "below";
  }
  if (actualValue > styleRange.max) {
    return "above";
  }
  return "in_range";
};

export function RecipeStyleStatsBlock({
  preview,
  recalculating,
  previewError,
  preferredGravityUnit
}: {
  preview: RecipeDraftPreviewDto | null;
  recalculating: boolean;
  previewError: string | null;
  preferredGravityUnit: PreferredGravityUnit;
}) {
  const selectedStyle = getBeerStyleById(preview?.styleId);
  const hasCalculatedMetrics = [preview?.og, preview?.fg, preview?.abv, preview?.ibu, preview?.color].some((value) => value != null);
  const hasSelectedStyle = Boolean(selectedStyle);
  const hasAnyStyleMetric = Boolean(selectedStyle && [selectedStyle.og, selectedStyle.fg, selectedStyle.abv, selectedStyle.ibu, selectedStyle.colorSrm].some((value) => value != null));
  const styleName = selectedStyle ? getBjcpStyleDisplayName(selectedStyle) : null;
  const selectedStyleArticleHref = getBjcpArticleHrefByStyleId(preview?.styleId);

  const items = [
    {
      label: "НП",
      valueLabel: formatGravity(preview?.og ?? null, preferredGravityUnit),
      actualValue: preview?.og ?? null,
      globalRange: globalBrewingRanges.og,
      styleRange: selectedStyle?.og ?? null,
      globalMinLabel: formatGravity(globalBrewingRanges.og.min, preferredGravityUnit),
      globalMaxLabel: formatGravity(globalBrewingRanges.og.max, preferredGravityUnit),
      status: getRangeStatus(preview?.og ?? null, selectedStyle?.og ?? null)
    },
    {
      label: "КП",
      valueLabel: formatGravity(preview?.fg ?? null, preferredGravityUnit),
      actualValue: preview?.fg ?? null,
      globalRange: globalBrewingRanges.fg,
      styleRange: selectedStyle?.fg ?? null,
      globalMinLabel: formatGravity(globalBrewingRanges.fg.min, preferredGravityUnit),
      globalMaxLabel: formatGravity(globalBrewingRanges.fg.max, preferredGravityUnit),
      status: getRangeStatus(preview?.fg ?? null, selectedStyle?.fg ?? null)
    },
    {
      label: "ABV",
      valueLabel: preview?.abv != null ? `${preview.abv.toFixed(1)}%` : "—",
      actualValue: preview?.abv ?? null,
      globalRange: globalBrewingRanges.abv,
      styleRange: selectedStyle?.abv ?? null,
      globalMinLabel: `${globalBrewingRanges.abv.min.toFixed(0)}%`,
      globalMaxLabel: `${globalBrewingRanges.abv.max.toFixed(0)}%`,
      status: getRangeStatus(preview?.abv ?? null, selectedStyle?.abv ?? null)
    },
    {
      label: "IBU",
      valueLabel: preview?.ibu != null ? `${preview.ibu.toFixed(0)}` : "—",
      actualValue: preview?.ibu ?? null,
      globalRange: globalBrewingRanges.ibu,
      styleRange: selectedStyle?.ibu ?? null,
      globalMinLabel: `${globalBrewingRanges.ibu.min.toFixed(0)}`,
      globalMaxLabel: `${globalBrewingRanges.ibu.max.toFixed(0)}`,
      status: getRangeStatus(preview?.ibu ?? null, selectedStyle?.ibu ?? null)
    },
    {
      label: "Color",
      valueLabel: preview?.color != null ? formatColorWithEbc(preview.color) : "—",
      actualValue: preview?.color ?? null,
      globalRange: globalBrewingRanges.colorSrm,
      styleRange: selectedStyle?.colorSrm ?? null,
      globalMinLabel: `${globalBrewingRanges.colorSrm.min.toFixed(0)}`,
      globalMaxLabel: `${globalBrewingRanges.colorSrm.max.toFixed(0)}`,
      status: getRangeStatus(preview?.color ?? null, selectedStyle?.colorSrm ?? null)
    }
  ];

  const comparableItems = items.filter((item) => item.actualValue != null && item.styleRange);
  const overallFit = comparableItems.length > 0 &&
    comparableItems.every((item) => item.status === "in_range");

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-[0_1px_3px_0_rgb(0_0_0_/_0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50/40 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm font-semibold text-zinc-700">
            {styleName && selectedStyleArticleHref ? (
              <>
                <span>Ваш рецепт и </span>
                <a
                  href={selectedStyleArticleHref}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Открыть описание BJCP стиля ${selectedStyle?.name ?? styleName}`}
                  className="inline-flex min-w-0 items-center gap-1.5 rounded-md underline-offset-2 transition-colors hover:text-zinc-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                >
                  <span className="truncate">{`BJCP ${styleName}`}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                </a>
              </>
            ) : styleName ? `Ваш рецепт и BJCP ${styleName}` : "Расчёт показателей"}
          </h2>
          {comparableItems.length > 0 ? (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${overallFit ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" : "bg-zinc-100 text-zinc-600 ring-1 ring-inset ring-zinc-200"}`}>
              {overallFit ? <CircleCheck className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}
              {overallFit ? "В стиле" : "Отклонения"}
            </span>
          ) : null}
          {hasSelectedStyle && hasCalculatedMetrics && !hasAnyStyleMetric ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200">
              <CircleAlert className="h-3 w-3" />
              Диапазоны BJCP не указаны
            </span>
          ) : null}
          {recalculating ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Пересчёт…
            </span>
          ) : null}
        </div>
        {previewError ? <p className="text-xs text-rose-500">{previewError}</p> : null}
      </div>

      <div className="flex-1 px-3 py-3">
        {items.map((item) => {
          const missingStyleRange = hasSelectedStyle && !item.styleRange;
          const appearance = hasSelectedStyle && !missingStyleRange ? getMetricStatusAppearance(item.status) : getMetricStatusAppearance("no_style");

          return (
            <div key={item.label} className="group grid items-center gap-x-2 rounded-lg px-1 py-1 transition-colors hover:bg-zinc-50 sm:grid-cols-[46px_minmax(0,1fr)_60px]">
              <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                <span>{item.label}</span>
              </div>
              <div>
                <StyleRangeTrack
                  actualValue={item.actualValue}
                  globalRange={item.globalRange}
                  styleRange={item.styleRange}
                  status={item.status}
                  valueLabel={item.valueLabel}
                  hasStyle={hasSelectedStyle}
                  missingStyleRange={missingStyleRange}
                />
                <div className="flex justify-between text-[9px] tabular-nums text-zinc-400">
                  <span>{item.globalMinLabel}</span>
                  <span>{item.globalMaxLabel}</span>
                </div>
              </div>
              <div className="flex justify-end">
                <span className={`inline-flex w-[60px] justify-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${appearance.badgeClassName}`}>
                  {appearance.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
