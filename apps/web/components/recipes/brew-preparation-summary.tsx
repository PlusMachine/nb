"use client";

import React from "react";
import type { BrewPreparationPreview } from "@/app/(public)/recipes/[slug]/brew-actions";
import { formatGravity, formatGravitySecondary } from "@/features/system/gravity-units";
import { useViewerGravityUnit } from "@/features/system/use-viewer-gravity-unit";

export function BrewPreparationSummary({ preview }: { preview: BrewPreparationPreview }) {
  const { unit } = useViewerGravityUnit();
  const secondary = formatGravitySecondary(preview.og, unit);
  const n = (value: number) => Number(value.toFixed(1));
  return (
    <div className="space-y-2 text-xs leading-5">
      <p className="font-medium text-foreground">Расчётные параметры: НП {formatGravity(preview.og, unit)}
        {secondary ? <span className="font-normal text-muted-foreground"> ({secondary})</span> : null}
        {preview.abv != null ? ` · ABV ${n(preview.abv)}%` : ""}{preview.ibu != null ? ` · IBU ${Math.round(preview.ibu)}` : ""}
        {preview.color != null ? ` · ${n(preview.color)} SRM` : ""}</p>
      <p className="text-muted-foreground">Вода для затора: {n(preview.mashWaterL)} л · промывка: {n(preview.spargeWaterL)} л. Авторские показатели могут отличаться от расчёта по составу.</p>
      {preview.warnings.length ? <div role="alert" className="space-y-1 rounded-lg bg-warning-subtle p-3 text-warning-subtle-foreground">{preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}
    </div>
  );
}
