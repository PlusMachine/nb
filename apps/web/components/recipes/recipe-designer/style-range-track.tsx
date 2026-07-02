"use client";

import React from "react";

import { clampPercent, getMetricPositionPercent, getMetricStatusAppearance } from "./helpers";

export function StyleRangeTrack({
  actualValue,
  globalRange,
  styleRange,
  status,
  valueLabel,
  hasStyle,
  missingStyleRange
}: {
  actualValue: number | null;
  globalRange: { min: number; max: number };
  styleRange: { min: number; max: number } | null;
  status: "in_range" | "below" | "above" | null;
  valueLabel: string;
  hasStyle: boolean;
  missingStyleRange: boolean;
}) {
  const appearance = hasStyle && !missingStyleRange ? getMetricStatusAppearance(status) : getMetricStatusAppearance("no_style");
  const valuePercent = getMetricPositionPercent(actualValue, globalRange.min, globalRange.max);

  const bandLeft = styleRange ? clampPercent(((styleRange.min - globalRange.min) / (globalRange.max - globalRange.min)) * 100) : null;
  const bandRight = styleRange ? clampPercent(((styleRange.max - globalRange.min) / (globalRange.max - globalRange.min)) * 100) : null;
  const bandWidth = bandLeft != null && bandRight != null ? bandRight - bandLeft : null;

  if (valuePercent == null && bandLeft == null) {
    return (
      <div className="flex h-5 items-center text-[11px] text-zinc-400">
        {missingStyleRange ? "Не указано в BJCP" : "Нет данных"}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <div className="relative h-6 w-full rounded-md bg-zinc-100">
        {bandLeft != null && bandWidth != null && (
          <div
            className="absolute inset-y-0 rounded-md bg-emerald-500/[.12] ring-1 ring-inset ring-emerald-500/20"
            style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
          />
        )}
        {valuePercent != null && (
          <>
            <div
              className={`absolute top-0 h-full w-[2px] -translate-x-[1px] ${appearance.needleClassName}`}
              style={{ left: `${valuePercent}%` }}
            />
            <div
              className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${appearance.needleDotClassName}`}
              style={{ left: `${valuePercent}%` }}
            />
          </>
        )}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums text-zinc-700">
          {valueLabel}
        </span>
      </div>
      {missingStyleRange ? (
        <div className="text-[9px] font-medium leading-tight text-zinc-500">Диапазон не указан в BJCP</div>
      ) : null}
    </div>
  );
}

