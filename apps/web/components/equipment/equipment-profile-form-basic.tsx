"use client";

import React, { useState } from "react";

import type { EquipmentBrewMethod, EquipmentProfilePayload } from "@/features/equipment-profiles/contracts";

export const equipmentFormInputClassName = "mt-1 h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-sm text-zinc-900";

const optionalValue = (value: number | null | undefined) => value == null ? "" : String(value);

type EquipmentProfileFormValues = {
  name: string;
  brewMethod: EquipmentBrewMethod;
  targetBatchVolumeL: string;
  boilTimeMin: string;
  brewhouseEfficiencyPct: string;
  evaporationRateLPerHr: string;
  trubChillerLossL: string;
  fermenterLossL: string;
  mashTunDeadspaceL: string;
  spargeVesselDeadspaceL: string;
  grainAbsorptionLPerKg: string;
  coolingShrinkagePct: string;
  topUpWaterL: string;
  mashThicknessLPerKg: string;
  maxMashVolumeL: string;
  maxKettleVolumeL: string;
  hopUtilizationFactor: string;
  altitudeM: string;
  notes: string;
};

type NumberFieldName = Exclude<keyof EquipmentProfileFormValues, "name" | "brewMethod" | "notes">;

const profileToFormValues = (profile: EquipmentProfilePayload): EquipmentProfileFormValues => ({
  name: profile.name,
  brewMethod: profile.brewMethod,
  targetBatchVolumeL: optionalValue(profile.targetBatchVolumeL),
  boilTimeMin: optionalValue(profile.boilTimeMin),
  brewhouseEfficiencyPct: optionalValue(profile.brewhouseEfficiencyPct),
  evaporationRateLPerHr: optionalValue(profile.evaporationRateLPerHr),
  trubChillerLossL: optionalValue(profile.trubChillerLossL),
  fermenterLossL: optionalValue(profile.fermenterLossL),
  mashTunDeadspaceL: optionalValue(profile.mashTunDeadspaceL),
  spargeVesselDeadspaceL: optionalValue(profile.spargeVesselDeadspaceL),
  grainAbsorptionLPerKg: optionalValue(profile.grainAbsorptionLPerKg),
  coolingShrinkagePct: optionalValue(profile.coolingShrinkagePct),
  topUpWaterL: optionalValue(profile.topUpWaterL),
  mashThicknessLPerKg: optionalValue(profile.mashThicknessLPerKg),
  maxMashVolumeL: optionalValue(profile.maxMashVolumeL),
  maxKettleVolumeL: optionalValue(profile.maxKettleVolumeL),
  hopUtilizationFactor: optionalValue(profile.hopUtilizationFactor),
  altitudeM: optionalValue(profile.altitudeM),
  notes: profile.notes ?? ""
});

const toNumber = (value: string, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toOptionalNumber = (value: string) => {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formValuesToProfile = (values: EquipmentProfileFormValues): EquipmentProfilePayload => ({
  name: values.name,
  brewMethod: values.brewMethod,
  targetBatchVolumeL: toNumber(values.targetBatchVolumeL),
  boilTimeMin: Math.round(toNumber(values.boilTimeMin)),
  brewhouseEfficiencyPct: toNumber(values.brewhouseEfficiencyPct),
  mashEfficiencyPct: null,
  evaporationRateLPerHr: toNumber(values.evaporationRateLPerHr),
  trubChillerLossL: toNumber(values.trubChillerLossL),
  fermenterLossL: toNumber(values.fermenterLossL),
  mashTunDeadspaceL: toNumber(values.mashTunDeadspaceL),
  spargeVesselDeadspaceL: toNumber(values.spargeVesselDeadspaceL),
  grainAbsorptionLPerKg: toNumber(values.grainAbsorptionLPerKg),
  coolingShrinkagePct: Math.min(Math.max(toNumber(values.coolingShrinkagePct), 0), 20),
  topUpWaterL: toNumber(values.topUpWaterL),
  mashThicknessLPerKg: toNumber(values.mashThicknessLPerKg),
  maxMashVolumeL: toOptionalNumber(values.maxMashVolumeL),
  maxKettleVolumeL: toOptionalNumber(values.maxKettleVolumeL),
  hopUtilizationFactor: toNumber(values.hopUtilizationFactor, 1),
  altitudeM: toNumber(values.altitudeM),
  notes: values.notes.trim() || null
});

function NumberField({
  name,
  label,
  value,
  onChange,
  step = 0.1,
  min = 0,
  max
}: {
  name: NumberFieldName;
  label: string;
  value: string;
  onChange: (name: NumberFieldName, value: string) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <label className="text-xs font-medium text-zinc-600">
      <span>{label}</span>
      <input
        name={name}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        className={equipmentFormInputClassName}
      />
    </label>
  );
}

export function EquipmentProfileFormFields({ profile }: { profile: EquipmentProfilePayload }) {
  const [values, setValues] = useState(() => profileToFormValues(profile));

  const setNumberField = (name: NumberFieldName, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
  };

  return (
    <div className="space-y-4">
      <input type="hidden" name="brewMethod" value={values.brewMethod} />
      <input type="hidden" name="mashTunDeadspaceL" value={values.mashTunDeadspaceL} />
      <input type="hidden" name="spargeVesselDeadspaceL" value={values.spargeVesselDeadspaceL} />
      <input type="hidden" name="topUpWaterL" value={values.topUpWaterL} />
      <section className="space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <input type="hidden" name="boilTimeMin" value={values.boilTimeMin} />
          <label className="text-xs font-medium text-zinc-600 md:col-span-3">
            Название
            <input
              name="name"
              value={values.name}
              onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
              className={equipmentFormInputClassName}
            />
          </label>
          <NumberField name="targetBatchVolumeL" label="Типичный объем партии, л" value={values.targetBatchVolumeL} onChange={setNumberField} />
          <NumberField name="brewhouseEfficiencyPct" label="Эффективность, %" value={values.brewhouseEfficiencyPct} onChange={setNumberField} step={0.1} min={1} max={100} />
          <NumberField name="evaporationRateLPerHr" label="Испарение, л/ч" value={values.evaporationRateLPerHr} onChange={setNumberField} />
          <NumberField name="trubChillerLossL" label="Потери в котле / на чиллере, л" value={values.trubChillerLossL} onChange={setNumberField} />
          <NumberField name="mashThicknessLPerKg" label="Гидромодуль, л/кг" value={values.mashThicknessLPerKg} onChange={setNumberField} step={0.1} min={0.1} />
          <NumberField name="grainAbsorptionLPerKg" label="Поглощение воды зерном, л/кг" value={values.grainAbsorptionLPerKg} onChange={setNumberField} step={0.01} />
        </div>
      </section>

      <details className="border-t border-zinc-100 pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-800">Еще параметры (опционально)</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <NumberField name="fermenterLossL" label="Потери в ферментере, л" value={values.fermenterLossL} onChange={setNumberField} />
          <NumberField name="coolingShrinkagePct" label="Усадка при охлаждении, %" value={values.coolingShrinkagePct} onChange={setNumberField} step={0.1} max={20} />
          <NumberField name="maxMashVolumeL" label="Макс. объем заторника, л (опц.)" value={values.maxMashVolumeL} onChange={setNumberField} />
          <NumberField name="maxKettleVolumeL" label="Макс. объем котла, л (опц)" value={values.maxKettleVolumeL} onChange={setNumberField} />
          <NumberField name="hopUtilizationFactor" label="Калибровка утилизации хмеля" value={values.hopUtilizationFactor} onChange={setNumberField} step={0.01} min={0.01} />
          <NumberField name="altitudeM" label="Высота над уровнем моря, м" value={values.altitudeM} onChange={setNumberField} step={1} min={-500} max={9000} />
          <label className="text-xs font-medium text-zinc-600 md:col-span-3">
            Заметки
            <textarea
              name="notes"
              value={values.notes}
              onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))}
              className="mt-1 min-h-20 w-full rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-sm text-zinc-900"
            />
          </label>
        </div>
      </details>
    </div>
  );
}

export const EquipmentProfileFormBasic = EquipmentProfileFormFields;
