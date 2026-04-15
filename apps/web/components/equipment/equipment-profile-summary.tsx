import React from "react";

import type { EquipmentProfilePayload } from "@/features/equipment-profiles/contracts";
import { buildEquipmentProfileVolumeSummary } from "@/features/equipment/summary";

const warningLabels: Record<string, string> = {
  mash_volume_limit_exceeded: "Объем затора превышает лимит.",
  kettle_volume_limit_exceeded: "Объем до кипячения превышает лимит котла."
};

export function EquipmentProfileSummary({
  profile,
  grainKg = 5
}: {
  profile: EquipmentProfilePayload;
  grainKg?: number;
}) {
  const summary = buildEquipmentProfileVolumeSummary(profile, grainKg);

  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-3 text-xs text-zinc-600">
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <span className="block text-[11px] uppercase text-zinc-400">Pre-boil</span>
          <span className="font-medium text-zinc-800">{summary.preBoilHotL.toFixed(1)} л</span>
        </div>
        <div>
          <span className="block text-[11px] uppercase text-zinc-400">Post-boil</span>
          <span className="font-medium text-zinc-800">{summary.postBoilHotL.toFixed(1)} л</span>
        </div>
        <div>
          <span className="block text-[11px] uppercase text-zinc-400">Total water</span>
          <span className="font-medium text-zinc-800">{summary.totalWaterL.toFixed(1)} л</span>
        </div>
        <div>
          <span className="block text-[11px] uppercase text-zinc-400">Mash water</span>
          <span className="font-medium text-zinc-800">{summary.mashWaterL.toFixed(1)} л</span>
        </div>
        <div>
          <span className="block text-[11px] uppercase text-zinc-400">Sparge water</span>
          <span className="font-medium text-zinc-800">{summary.spargeWaterL.toFixed(1)} л</span>
        </div>
      </div>
      {summary.warnings.length ? (
        <div className="mt-2 space-y-1 text-amber-700">
          {summary.warnings.map((warning) => <p key={warning}>{warningLabels[warning] ?? warning}</p>)}
        </div>
      ) : null}
    </div>
  );
}
