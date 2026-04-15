import React from "react";

import { equipmentBatchTargetTypes, equipmentBrewMethods, type EquipmentProfilePayload } from "@/features/equipment-profiles/contracts";

export const equipmentFormInputClassName = "mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm text-zinc-900";

export const equipmentBrewMethodLabels: Record<(typeof equipmentBrewMethods)[number], string> = {
  biab_single_vessel: "BIAB / одна емкость",
  mash_sparge_two_vessel: "Затор + промывка",
  three_vessel: "Три емкости",
  extract_partial_boil: "Экстракт / частичное кипячение"
};

export const equipmentBatchTargetLabels: Record<(typeof equipmentBatchTargetTypes)[number], string> = {
  fermenter: "в ферментере",
  packaged: "после розлива"
};

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

export function EquipmentProfileFormBasic({ profile }: { profile: EquipmentProfilePayload }) {
  const waterMethodLabel = profile.brewMethod === "biab_single_vessel"
    ? "No Sparge / BIAB"
    : profile.brewMethod === "extract_partial_boil"
      ? "Default sparge не нужен"
      : "Default sparge";

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <label className="text-xs font-medium text-zinc-600 md:col-span-3">
        Название
        <input name="name" defaultValue={profile.name} className={equipmentFormInputClassName} />
      </label>
      <label className="text-xs font-medium text-zinc-600">
        Метод варки
        <select name="brewMethod" defaultValue={profile.brewMethod} className={equipmentFormInputClassName}>
          {equipmentBrewMethods.map((method) => (
            <option key={method} value={method}>{equipmentBrewMethodLabels[method]}</option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-zinc-600">
        Целевой объем
        <select name="batchTargetType" defaultValue={profile.batchTargetType} className={equipmentFormInputClassName}>
          {equipmentBatchTargetTypes.map((target) => (
            <option key={target} value={target}>{equipmentBatchTargetLabels[target]}</option>
          ))}
        </select>
      </label>
      <NumberField name="targetBatchVolumeL" label="Объем партии, л" value={profile.targetBatchVolumeL} />
      <NumberField name="boilTimeMin" label="Кипячение, мин" value={profile.boilTimeMin} step={1} min={1} />
      <NumberField name="brewhouseEfficiencyPct" label="Эффективность, %" value={profile.brewhouseEfficiencyPct} step={0.1} min={1} />
      <NumberField name="evaporationRateLPerHr" label="Испарение, л/ч" value={profile.evaporationRateLPerHr} />
      <NumberField name="trubChillerLossL" label="Потери в котле / на чиллере, л" value={profile.trubChillerLossL} />
      <NumberField name="grainAbsorptionLPerKg" label="Grain absorption, л/кг" value={profile.grainAbsorptionLPerKg} step={0.01} />
      <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
        <span className="block font-medium text-zinc-700">Метод расчета воды</span>
        <span>{waterMethodLabel}</span>
      </div>
      <NumberField name="mashThicknessLPerKg" label="Mash thickness, л/кг" value={profile.mashThicknessLPerKg} step={0.1} min={0.1} />
    </div>
  );
}
