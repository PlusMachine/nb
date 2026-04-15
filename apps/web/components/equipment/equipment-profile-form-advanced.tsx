import React from "react";

import type { EquipmentProfilePayload } from "@/features/equipment-profiles/contracts";

import { equipmentFormInputClassName } from "./equipment-profile-form-basic";

const optionalValue = (value: number | null | undefined) => value == null ? "" : String(value);

function NumberField({
  name,
  label,
  value,
  step = 0.1,
  min = 0
}: {
  name: keyof EquipmentProfilePayload;
  label: string;
  value: number | null | undefined;
  step?: number;
  min?: number;
}) {
  return (
    <label className="text-xs font-medium text-zinc-600">
      {label}
      <input name={name} type="number" min={min} step={step} defaultValue={optionalValue(value)} className={equipmentFormInputClassName} />
    </label>
  );
}

export function EquipmentProfileFormAdvanced({ profile }: { profile: EquipmentProfilePayload }) {
  return (
    <details className="rounded-lg border border-zinc-100 bg-zinc-50 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-zinc-800">Расширенные параметры</summary>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <NumberField name="mashEfficiencyPct" label="Mash efficiency, %" value={profile.mashEfficiencyPct} step={0.1} min={1} />
        <NumberField name="fermenterLossL" label="Потери в ферментере, л" value={profile.fermenterLossL} />
        <NumberField name="mashTunDeadspaceL" label="Mash tun dead space, л" value={profile.mashTunDeadspaceL} />
        <NumberField name="spargeVesselDeadspaceL" label="Sparge dead space, л" value={profile.spargeVesselDeadspaceL} />
        <NumberField name="coolingShrinkagePct" label="Cooling shrinkage, %" value={profile.coolingShrinkagePct} step={0.1} />
        <NumberField name="topUpWaterL" label="Top-up water, л" value={profile.topUpWaterL} />
        <NumberField name="maxMashVolumeL" label="Max mash volume, л" value={profile.maxMashVolumeL} />
        <NumberField name="maxKettleVolumeL" label="Max kettle volume, л" value={profile.maxKettleVolumeL} />
        <NumberField name="hopUtilizationFactor" label="Hop utilization factor" value={profile.hopUtilizationFactor} step={0.01} min={0.01} />
        <NumberField name="altitudeM" label="Высота, м" value={profile.altitudeM} step={1} min={-500} />
        <label className="text-xs font-medium text-zinc-600 md:col-span-3">
          Notes
          <textarea
            name="notes"
            defaultValue={profile.notes ?? ""}
            className="mt-1 min-h-20 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm text-zinc-900"
          />
        </label>
      </div>
    </details>
  );
}
