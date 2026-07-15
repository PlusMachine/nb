import React from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, ExternalLink } from "lucide-react";
import { getBeerStyleById, getBjcpArticleHrefByStyleId, getBjcpStyleDisplayName, getStyleRangeById } from "@nb/brewing-core";

import type { RecipeDetailDto, RecipeListItemDto } from "@/features/recipes/contracts";
import { beerColorFromSrm } from "@/features/recipes/beer-color";
import { resolveRecipeFgHelperText, resolveRecipeFgSourceLabel } from "@/features/recipes/fg-estimate";
import { formatGravity, formatGravityRange, formatGravitySecondary, type PreferredGravityUnit } from "@/features/system/gravity-units";
import { BeerGlassIcon } from "@/components/recipes/beer-glass-icon";

type RecipeStatsSource = Pick<RecipeListItemDto | RecipeDetailDto, "og" | "fg" | "abv" | "ibu" | "color" | "styleId">
  & Partial<Pick<RecipeDetailDto, "fgEstimateMode" | "fgEstimateDetails">>;

type MetricStatus = "in_range" | "below" | "above";

type MetricRange = { min: number; max: number };

const metricStatusOf = (value: number | null | undefined, range: MetricRange | null): MetricStatus | null => {
  if (value == null || !Number.isFinite(value) || !range) {
    return null;
  }
  if (value < range.min) {
    return "below";
  }
  if (value > range.max) {
    return "above";
  }
  return "in_range";
};

const deviationLabels: Record<Exclude<MetricStatus, "in_range">, string> = {
  below: "ниже",
  above: "выше"
};

const metricStatusSrLabels: Record<MetricStatus, string> = {
  in_range: "В диапазоне стиля",
  below: "Ниже диапазона стиля",
  above: "Выше диапазона стиля"
};

// Мини-трек «значение против диапазона стиля»: диапазон занимает центральную часть
// шкалы (по RANGE_PAD_RATIO ширины диапазона с каждой стороны), значение-точка
// прижимается к краю, если выходит за шкалу.
const RANGE_PAD_RATIO = 0.35;
const BAND_LEFT_PCT = (RANGE_PAD_RATIO / (1 + 2 * RANGE_PAD_RATIO)) * 100;
const BAND_WIDTH_PCT = (1 / (1 + 2 * RANGE_PAD_RATIO)) * 100;

const trackPositionPercent = (value: number, range: MetricRange): number => {
  const span = Math.max(range.max - range.min, Number.EPSILON);
  const lo = range.min - span * RANGE_PAD_RATIO;
  const hi = range.max + span * RANGE_PAD_RATIO;
  return Math.min(100, Math.max(0, ((value - lo) / (hi - lo)) * 100));
};

const formatPlainNumber = (value: number): string => (
  Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "")
);

const formatPlainRange = (range: MetricRange, unit = ""): string => (
  `${formatPlainNumber(range.min)}–${formatPlainNumber(range.max)}${unit}`
);

function MetricValue({ children }: { children: React.ReactNode }) {
  return <div className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{children}</div>;
}

export function RecipeStatsSummary({
  recipe,
  gravityLabels = { og: "OG", fg: "FG" },
  preferredGravityUnit
}: {
  recipe: RecipeStatsSource;
  gravityLabels?: { og: string; fg: string };
  preferredGravityUnit: PreferredGravityUnit;
}) {
  const styleRange = getStyleRangeById(recipe.styleId);
  // Диапазоны на треках — целевые для стиля BJCP; сам стиль (с кодом) называем
  // прямо в шапке блока, иначе непонятно, к чему относятся «полосы».
  const style = getBeerStyleById(recipe.styleId);
  const styleName = style ? getBjcpStyleDisplayName(style) : null;
  const styleCode = style && style.bjcpId !== "LEGACY" ? style.bjcpId : null;
  const styleChipText = styleName ? (styleCode ? `BJCP ${styleName} · ${styleCode}` : `BJCP ${styleName}`) : null;
  const styleHref = getBjcpArticleHrefByStyleId(recipe.styleId);
  const fgSourceLabel = resolveRecipeFgSourceLabel(recipe.fgEstimateMode, recipe.fgEstimateDetails);
  const fgHelperText = resolveRecipeFgHelperText(recipe.fgEstimateMode, recipe.fg);
  const colorInfo = recipe.color != null && Number.isFinite(recipe.color) ? beerColorFromSrm(recipe.color) : null;
  const srmText = recipe.color != null ? recipe.color.toFixed(1).replace(/\.0$/, "") : null;

  const fgSecondary = [
    formatGravitySecondary(recipe.fg, preferredGravityUnit),
    recipe.fg != null ? fgSourceLabel : fgHelperText
  ].filter(Boolean).join(" · ") || null;

  const items: Array<{
    key: string;
    label: string;
    value: React.ReactNode;
    secondary: string | null;
    rawValue: number | null;
    range: MetricRange | null;
    rangeText: string | null;
  }> = [
    {
      key: "og",
      label: gravityLabels.og,
      value: <MetricValue>{formatGravity(recipe.og, preferredGravityUnit)}</MetricValue>,
      secondary: formatGravitySecondary(recipe.og, preferredGravityUnit),
      rawValue: recipe.og ?? null,
      range: styleRange?.og ?? null,
      rangeText: styleRange ? formatGravityRange(styleRange.og.min, styleRange.og.max, preferredGravityUnit) : null
    },
    {
      key: "fg",
      label: gravityLabels.fg,
      value: <MetricValue>{formatGravity(recipe.fg, preferredGravityUnit)}</MetricValue>,
      secondary: fgSecondary,
      rawValue: recipe.fg ?? null,
      range: styleRange?.fg ?? null,
      rangeText: styleRange ? formatGravityRange(styleRange.fg.min, styleRange.fg.max, preferredGravityUnit) : null
    },
    {
      key: "abv",
      label: "ABV",
      value: <MetricValue>{recipe.abv == null ? "—" : `${recipe.abv.toFixed(1)}%`}</MetricValue>,
      secondary: null,
      rawValue: recipe.abv ?? null,
      range: styleRange?.abv ?? null,
      rangeText: styleRange ? formatPlainRange(styleRange.abv, "%") : null
    },
    {
      key: "ibu",
      label: "IBU",
      value: <MetricValue>{recipe.ibu == null ? "—" : recipe.ibu.toFixed(0)}</MetricValue>,
      secondary: null,
      rawValue: recipe.ibu ?? null,
      range: styleRange?.ibu ?? null,
      rangeText: styleRange ? formatPlainRange(styleRange.ibu) : null
    },
    {
      key: "color",
      label: "Цвет",
      value: colorInfo && srmText ? (
        <div className="flex items-center gap-1.5">
          <BeerGlassIcon color={colorInfo.hex} size={24} className="shrink-0" />
          <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{srmText}</span>
          <span className="text-xs font-medium text-muted-foreground">SRM</span>
        </div>
      ) : <MetricValue>—</MetricValue>,
      secondary: colorInfo && recipe.color != null
        ? `${(recipe.color * 1.97).toFixed(0)} EBC · ${colorInfo.label}`
        : null,
      rawValue: recipe.color ?? null,
      range: styleRange?.colorSrm ?? null,
      rangeText: styleRange ? formatPlainRange(styleRange.colorSrm) : null
    }
  ];

  const statuses = items.map((item) => metricStatusOf(item.rawValue, item.range));
  const evaluated = statuses.filter((status): status is MetricStatus => status != null);
  const overallFit = evaluated.length > 0 && evaluated.every((status) => status === "in_range");

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">Ключевые показатели</h2>
        <div className="flex flex-wrap items-center gap-3">
          {styleChipText ? (
            styleHref ? (
              <Link
                href={styleHref}
                className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 underline-offset-2 transition-colors hover:text-violet-900 hover:underline dark:text-violet-300 dark:hover:text-violet-200"
              >
                {styleChipText}
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
              </Link>
            ) : (
              <span className="text-xs font-medium text-violet-700 dark:text-violet-300">
                {styleChipText}
              </span>
            )
          ) : null}
          {evaluated.length > 0 ? (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${overallFit ? "bg-success-subtle text-success-subtle-foreground ring-1 ring-success/30" : "bg-warning-subtle text-warning-subtle-foreground ring-1 ring-warning/30"}`}>
              {overallFit ? <CircleCheck className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
              {overallFit ? "В стиле" : "Есть отклонения"}
            </span>
          ) : null}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((item, index) => {
          const status = statuses[index] ?? null;

          return (
            <div key={item.key} className="flex min-w-0 flex-col rounded-xl border border-border p-3.5">
              <dt className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{item.label}</dt>
              <dd className="mt-1.5 min-w-0">
                {item.value}
                {item.secondary ? (
                  <div title={item.secondary} className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">{item.secondary}</div>
                ) : null}
              </dd>
              {item.range && item.rangeText ? (
                <div className="mt-auto pt-3">
                  <div className="relative h-1.5 w-full rounded-full bg-muted">
                    <div
                      className="absolute inset-y-0 rounded-full bg-success/20"
                      style={{ left: `${BAND_LEFT_PCT}%`, width: `${BAND_WIDTH_PCT}%` }}
                    />
                    {item.rawValue != null && status ? (
                      <span
                        className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card ${status === "in_range" ? "bg-success" : "bg-warning"}`}
                        style={{ left: `${trackPositionPercent(item.rawValue, item.range)}%` }}
                      >
                        <span className="sr-only">{metricStatusSrLabels[status]}</span>
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-1 text-[10px] tabular-nums text-muted-foreground">
                    <span className="truncate">стиль {item.rangeText}</span>
                    {status && status !== "in_range" ? (
                      <span className="shrink-0 font-medium text-warning-subtle-foreground">{deviationLabels[status]}</span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </dl>
    </section>
  );
}
