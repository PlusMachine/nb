import React from "react";

import type { EquipmentProfilePayload } from "@/features/equipment-profiles/contracts";
import { buildEquipmentProfileVolumeSummary } from "@/features/equipment/summary";

const warningLabels: Record<string, string> = {
  mash_volume_limit_exceeded: "Лимит затора",
  kettle_volume_limit_exceeded: "Лимит котла"
};

const formatLiters = (value: number) => Number.isFinite(value) ? `${value.toFixed(1)} л` : "—";
const formatOptionalLiters = (value: number | null | undefined) => value == null ? "не задан" : formatLiters(value);

export function EquipmentProfileSummary({
  profile,
  grainKg = 5,
  compact = false
}: {
  profile: EquipmentProfilePayload;
  grainKg?: number;
  compact?: boolean;
}) {
  const summary = buildEquipmentProfileVolumeSummary(profile, grainKg);
  const maxMashVolumeL = profile.maxMashVolumeL ?? null;

  return (
    <section className={compact
      ? "space-y-3 rounded-lg border border-border bg-muted px-3 py-3 text-xs text-muted-foreground"
      : "space-y-3 rounded-lg border border-success/30 bg-success-subtle/50 px-3 py-3 text-xs text-muted-foreground"
    }>
      <h3 className="text-sm font-semibold text-foreground">Что будет рассчитано</h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <span className="block text-[11px] uppercase text-muted-foreground">Pre-boil</span>
          <span className="font-medium text-foreground">{formatLiters(summary.preBoilHotL)}</span>
        </div>
        <div>
          <span className="block text-[11px] uppercase text-muted-foreground">Post-boil</span>
          <span className="font-medium text-foreground">{formatLiters(summary.postBoilHotL)}</span>
        </div>
        <div>
          <span className="block text-[11px] uppercase text-muted-foreground">Всего воды</span>
          <span className="font-medium text-foreground">{formatLiters(summary.totalWaterL)}</span>
        </div>
        <div>
          <span className="block text-[11px] uppercase text-muted-foreground">Mash / sparge</span>
          <span className="font-medium text-foreground">{formatLiters(summary.mashWaterL)} / {formatLiters(summary.spargeWaterL)}</span>
        </div>
        <div>
          <span className="block text-[11px] uppercase text-muted-foreground">Max mash</span>
          <span className="font-medium text-foreground">{formatOptionalLiters(maxMashVolumeL)}</span>
        </div>
      </div>
      {summary.warnings.length ? (
        <div className="mt-2 space-y-1 text-warning-subtle-foreground">
          {summary.warnings.map((warning) => <p key={warning}>{warningLabels[warning] ?? warning}</p>)}
        </div>
      ) : null}
    </section>
  );
}
