"use client";

import React, { useState } from "react";

import { Select } from "@nb/ui";
import { equipmentPresets } from "@/features/equipment/presets";
import type { EquipmentProfilePayload } from "@/features/equipment-profiles/contracts";

export const equipmentFormInputClassName = "mt-1 h-9 w-full rounded-md border border-border bg-card px-2.5 text-sm text-foreground";

const optionalValue = (value: number | null | undefined) => value == null ? "" : String(value);

type EquipmentProfileFormValues = {
  name: string;
  targetBatchVolumeL: string;
  brewhouseEfficiencyPct: string;
  evaporationRateLPerHr: string;
  trubChillerLossL: string;
  fermenterLossL: string;
  grainAbsorptionLPerKg: string;
  coolingShrinkagePct: string;
  mashThicknessLPerKg: string;
  mashTunDeadspaceL: string;
  minMashVolumeL: string;
  maxGrainKg: string;
  maxMashVolumeL: string;
  maxKettleVolumeL: string;
  hopUtilizationFactor: string;
  altitudeM: string;
  notes: string;
};

type NumberFieldName = Exclude<keyof EquipmentProfileFormValues, "name" | "notes">;

const profileToFormValues = (profile: EquipmentProfilePayload): EquipmentProfileFormValues => ({
  name: profile.name,
  targetBatchVolumeL: optionalValue(profile.targetBatchVolumeL),
  brewhouseEfficiencyPct: optionalValue(profile.brewhouseEfficiencyPct),
  evaporationRateLPerHr: optionalValue(profile.evaporationRateLPerHr),
  trubChillerLossL: optionalValue(profile.trubChillerLossL),
  fermenterLossL: optionalValue(profile.fermenterLossL),
  grainAbsorptionLPerKg: optionalValue(profile.grainAbsorptionLPerKg),
  coolingShrinkagePct: optionalValue(profile.coolingShrinkagePct),
  mashThicknessLPerKg: optionalValue(profile.mashThicknessLPerKg),
  mashTunDeadspaceL: optionalValue(profile.mashTunDeadspaceL),
  minMashVolumeL: optionalValue(profile.minMashVolumeL),
  maxGrainKg: optionalValue(profile.maxGrainKg),
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
  targetBatchVolumeL: toNumber(values.targetBatchVolumeL),
  brewhouseEfficiencyPct: toNumber(values.brewhouseEfficiencyPct),
  evaporationRateLPerHr: toNumber(values.evaporationRateLPerHr),
  trubChillerLossL: toNumber(values.trubChillerLossL),
  fermenterLossL: toNumber(values.fermenterLossL),
  grainAbsorptionLPerKg: toNumber(values.grainAbsorptionLPerKg),
  coolingShrinkagePct: Math.min(Math.max(toNumber(values.coolingShrinkagePct), 0), 20),
  mashThicknessLPerKg: toNumber(values.mashThicknessLPerKg),
  mashTunDeadspaceL: toNumber(values.mashTunDeadspaceL),
  minMashVolumeL: toOptionalNumber(values.minMashVolumeL),
  maxGrainKg: toOptionalNumber(values.maxGrainKg),
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
    <label className="text-xs font-medium text-muted-foreground">
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

const presetGroups = equipmentPresets.reduce<Array<{ brand: string; items: typeof equipmentPresets }>>(
  (groups, item) => {
    const group = groups.find((candidate) => candidate.brand === item.brand);

    if (group) {
      group.items.push(item);
    } else {
      groups.push({ brand: item.brand, items: [item] });
    }

    return groups;
  },
  []
);

/** Имя профиля уникально в пределах пользователя, поэтому второй «Grainfather G30»
 *  без суффикса упал бы уже на вставке в БД. */
const buildUnusedName = (name: string, takenNames: string[]) => {
  const taken = new Set(takenNames);

  if (!taken.has(name)) {
    return name;
  }

  for (let index = 2; index < 100; index += 1) {
    const candidate = `${name} (${index})`;

    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  return name;
};

export function EquipmentProfileFormFields({
  profile,
  showPresets = false,
  existingNames = []
}: {
  profile: EquipmentProfilePayload;
  showPresets?: boolean;
  existingNames?: string[];
}) {
  const [values, setValues] = useState(() => profileToFormValues(profile));
  const [presetId, setPresetId] = useState("");

  const setNumberField = (name: NumberFieldName, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
  };

  const applyPreset = (nextPresetId: string) => {
    setPresetId(nextPresetId);

    const selected = equipmentPresets.find((item) => item.id === nextPresetId);

    setValues(profileToFormValues(selected
      ? { ...selected.profile, name: buildUnusedName(selected.profile.name, existingNames) }
      : profile));
  };

  return (
    <div className="space-y-4">
      {showPresets ? (
        <Select
          label="Модель пивоварни"
          value={presetId}
          onChange={(event) => applyPreset(event.target.value)}
        >
          <option value="">Своя сборка</option>
          {presetGroups.map((group) => (
            <optgroup key={group.brand} label={group.brand}>
              {group.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.brand} {item.model}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      ) : null}

      <section className="space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs font-medium text-muted-foreground md:col-span-3">
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

      <details className="border-t border-border pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">Еще параметры (опционально)</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <NumberField name="fermenterLossL" label="Потери в ферментере, л" value={values.fermenterLossL} onChange={setNumberField} />
          <NumberField name="coolingShrinkagePct" label="Усадка при охлаждении, %" value={values.coolingShrinkagePct} onChange={setNumberField} step={0.1} max={20} />
          <NumberField name="mashTunDeadspaceL" label="Мертвый объем заторника, л" value={values.mashTunDeadspaceL} onChange={setNumberField} />
          <NumberField name="minMashVolumeL" label="Мин. объем заторника, л (опц.)" value={values.minMashVolumeL} onChange={setNumberField} />
          <NumberField name="maxGrainKg" label="Макс. засыпь, кг (опц.)" value={values.maxGrainKg} onChange={setNumberField} />
          <NumberField name="maxMashVolumeL" label="Макс. объем заторника, л (опц.)" value={values.maxMashVolumeL} onChange={setNumberField} />
          <NumberField name="maxKettleVolumeL" label="Макс. объем котла, л (опц)" value={values.maxKettleVolumeL} onChange={setNumberField} />
          <NumberField name="hopUtilizationFactor" label="Калибровка утилизации хмеля" value={values.hopUtilizationFactor} onChange={setNumberField} step={0.01} min={0.01} />
          <NumberField name="altitudeM" label="Высота над уровнем моря, м" value={values.altitudeM} onChange={setNumberField} step={1} min={-500} max={9000} />
          <label className="text-xs font-medium text-muted-foreground md:col-span-3">
            Заметки
            <textarea
              name="notes"
              value={values.notes}
              onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))}
              className="mt-1 min-h-20 w-full rounded-md border border-border bg-card px-2.5 py-2 text-sm text-foreground"
            />
          </label>
        </div>
      </details>
    </div>
  );
}

export const EquipmentProfileFormBasic = EquipmentProfileFormFields;
