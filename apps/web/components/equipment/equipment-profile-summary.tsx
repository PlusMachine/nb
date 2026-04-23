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
      ? "space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs text-zinc-600"
      : "space-y-3 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-3 text-xs text-zinc-600"
    }>
      <h3 className="text-sm font-semibold text-zinc-800">Что будет рассчитано</h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <span className="block text-[11px] uppercase text-zinc-400">Pre-boil</span>
          <span className="font-medium text-zinc-800">{formatLiters(summary.preBoilHotL)}</span>
        </div>
        <div>
          <span className="block text-[11px] uppercase text-zinc-400">Post-boil</span>
          <span className="font-medium text-zinc-800">{formatLiters(summary.postBoilHotL)}</span>
        </div>
        <div>
          <span className="block text-[11px] uppercase text-zinc-400">Всего воды</span>
          <span className="font-medium text-zinc-800">{formatLiters(summary.totalWaterL)}</span>
        </div>
        <div>
          <span className="block text-[11px] uppercase text-zinc-400">Mash / sparge</span>
          <span className="font-medium text-zinc-800">{formatLiters(summary.mashWaterL)} / {formatLiters(summary.spargeWaterL)}</span>
        </div>
        <div>
          <span className="block text-[11px] uppercase text-zinc-400">Max mash</span>
          <span className="font-medium text-zinc-800">{formatOptionalLiters(maxMashVolumeL)}</span>
        </div>
      </div>
      {summary.warnings.length ? (
        <div className="mt-2 space-y-1 text-amber-700">
          {summary.warnings.map((warning) => <p key={warning}>{warningLabels[warning] ?? warning}</p>)}
        </div>
      ) : null}
    </section>
  );
}
