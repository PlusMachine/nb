"use client";

import React from "react";

import {
  recipeMashPhModelLabels,
  recipeMashPhModels,
  recipeWaterEngineModes,
  type RecipeWaterPlanMeta
} from "@/features/recipes/contracts";
import type { RecipeWaterPlanResult } from "@/features/recipes/water-plan";
import {
  builtInSourceWaterProfiles,
  builtInTargetWaterProfiles,
  findBuiltInSourceWaterProfile,
  findBuiltInTargetWaterProfile
} from "@/features/recipes/water-profiles";

import { WaterSummaryCard } from "./water-summary-card";

const calculationModeLabels: Record<RecipeWaterPlanMeta["engine"], string> = {
  profile_only: "Только профиль воды",
  balanced_default: "Базовый режим",
  advanced_manual: "Расширенные настройки"
};

const acidLabels: Record<NonNullable<RecipeWaterPlanMeta["selectedAcid"]>, string> = {
  lactic_acid: "Молочная кислота",
  phosphoric_acid: "Фосфорная кислота"
};

const waterWarningLabels: Record<string, string> = {
  equipment_profile_missing_using_starter: "Нет выбранного оборудования: объемы считаются по профилю по умолчанию.",
  mash_volume_limit_exceeded: "Объем затора превышает лимит профиля, часть воды перенесена в промывку.",
  kettle_volume_limit_exceeded: "Объем до кипячения превышает лимит котла.",
  source_profile_missing_or_zero: "Исходный профиль воды не заполнен.",
  target_profile_missing_or_zero: "Целевой профиль воды не заполнен.",
  grain_bill_missing_for_mash_ph: "Для pH нужен зерновой состав.",
  mash_ph_ballpark_estimate: "pH затора — примерный расчет, его стоит калибровать по измерениям.",
  mash_acid_model_practical_approximation: "Кислота считается практическим приближением.",
  target_already_reached: "Целевой pH уже достигнут без кислоты.",
  target_not_reached_within_max_acid: "Целевой pH не достигнут в заданном лимите кислоты.",
  calcium_above_practical_range: "Ca выше практического диапазона.",
  magnesium_above_practical_range: "Mg выше практического диапазона.",
  sodium_above_practical_range: "Na выше практического диапазона.",
  chloride_above_practical_range: "Cl выше практического диапазона.",
  sulfate_above_practical_range: "SO4 выше практического диапазона.",
  bicarbonate_above_practical_range: "HCO3 выше практического диапазона."
};

const ionKeys = ["ca", "mg", "na", "cl", "so4", "hco3"] as const;
const ionLabels: Record<(typeof ionKeys)[number], string> = {
  ca: "Ca",
  mg: "Mg",
  na: "Na",
  cl: "Cl",
  so4: "SO4",
  hco3: "HCO3"
};

const saltOptions = [
  ["gypsum", "Gypsum"],
  ["calcium_chloride", "Calcium Chloride"],
  ["epsom_salt", "Epsom Salt"],
  ["table_salt", "Table Salt"],
  ["baking_soda", "Baking Soda"],
  ["chalk", "Chalk"],
  ["slaked_lime", "Slaked Lime"]
] as const;

const formatAdditions = (items: RecipeWaterPlanResult["mashSaltAdditions"]) => (
  items.length ? items.map((item) => `${item.label} ${item.grams.toFixed(2)} г`).join(", ") : "без солей"
);

const formatProfile = (profile: RecipeWaterPlanResult["finalProfile"]) => (
  `Ca ${profile.ca.toFixed(0)} / Mg ${profile.mg.toFixed(0)} / Na ${profile.na.toFixed(0)} / Cl ${profile.cl.toFixed(0)} / SO4 ${profile.so4.toFixed(0)} / HCO3 ${profile.hco3.toFixed(0)} ppm`
);

const toOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
};

export function WaterSetupWizard({
  waterPlanMeta,
  waterPlanResult,
  onChange
}: {
  waterPlanMeta: RecipeWaterPlanMeta;
  waterPlanResult: RecipeWaterPlanResult;
  onChange: (next: RecipeWaterPlanMeta) => void;
}) {
  const source = waterPlanMeta.sourceProfile ?? { ca: 0, mg: 0, na: 0, cl: 0, so4: 0, hco3: 0, ph: null };
  const target = waterPlanMeta.targetProfile ?? { ca: 0, mg: 0, na: 0, cl: 0, so4: 0, hco3: 0, ph: null };
  const visibleWarnings = waterPlanResult.warnings.slice(0, 4);
  const selectedAcid = waterPlanMeta.selectedAcid ?? "lactic_acid";

  const applySourcePreset = (presetId: string) => {
    const preset = findBuiltInSourceWaterProfile(presetId);
    if (!preset) return;
    onChange({
      ...waterPlanMeta,
      setupEnabled: true,
      sourceProfileMode: presetId === "ro_distilled" ? "ro_distilled" : "preset",
      sourceProfilePresetId: preset.id,
      sourceProfile: preset.profile
    });
  };

  const applyTargetPreset = (presetId: string, mode: RecipeWaterPlanMeta["targetProfileMode"]) => {
    const preset = findBuiltInTargetWaterProfile(presetId);
    if (!preset) return;
    onChange({
      ...waterPlanMeta,
      setupEnabled: true,
      targetProfileMode: mode,
      targetProfilePresetId: preset.id,
      targetProfile: preset.profile
    });
  };

  const updateIon = (kind: "sourceProfile" | "targetProfile", key: keyof typeof source, value: string) => {
    onChange({
      ...waterPlanMeta,
      setupEnabled: true,
      [kind]: {
        ...(kind === "sourceProfile" ? source : target),
        [key]: value.trim() ? Number(value) : 0
      }
    });
  };

  const updateManualSalt = (index: number, patch: { salt?: string; grams?: number }) => {
    const next = [...(waterPlanMeta.manualSaltAdditions ?? [])];
    const current = next[index] ?? { salt: "gypsum", grams: 0 };
    next[index] = { ...current, ...patch };
    onChange({ ...waterPlanMeta, manualSaltAdditions: next });
  };

  return (
    <details className="group rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-zinc-700">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-50 text-sky-700">H2O</span>
        Вода
        <span className="text-xs font-normal text-zinc-400">
          {waterPlanMeta.setupEnabled ? "пошаговая настройка" : "не настроена"}
        </span>
        <span className="ml-auto text-zinc-400 transition-transform group-open:rotate-90">›</span>
      </summary>

      <div className="mt-4 space-y-5">
        <WaterSummaryCard waterPlanMeta={waterPlanMeta} waterPlanResult={waterPlanResult} />

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-900">1. Настроить водоподготовку?</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onChange({ ...waterPlanMeta, setupEnabled: false })}
              className={`rounded-md px-3 py-2 text-sm ${!waterPlanMeta.setupEnabled ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-700"}`}
            >
              Пока нет
            </button>
            <button
              type="button"
              onClick={() => {
                const sourcePreset = findBuiltInSourceWaterProfile(waterPlanMeta.sourceProfilePresetId ?? "ro_distilled");
                const targetPreset = findBuiltInTargetWaterProfile(waterPlanMeta.targetProfilePresetId ?? "balanced");
                onChange({
                  ...waterPlanMeta,
                  setupEnabled: true,
                  sourceProfileMode: waterPlanMeta.sourceProfileMode ?? "ro_distilled",
                  sourceProfilePresetId: sourcePreset?.id ?? "ro_distilled",
                  sourceProfile: waterPlanMeta.sourceProfile ?? sourcePreset?.profile ?? null,
                  targetProfileMode: waterPlanMeta.targetProfileMode ?? "balanced",
                  targetProfilePresetId: targetPreset?.id ?? "balanced",
                  targetProfile: waterPlanMeta.targetProfile ?? targetPreset?.profile ?? null
                });
              }}
              className={`rounded-md px-3 py-2 text-sm ${waterPlanMeta.setupEnabled ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-700"}`}
            >
              Да, настроить
            </button>
          </div>
        </section>

        {waterPlanMeta.setupEnabled ? (
          <>
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-zinc-900">2. Какая у вас исходная вода?</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {builtInSourceWaterProfiles.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applySourcePreset(preset.id)}
                    className={`rounded-lg border px-3 py-3 text-left text-sm ${waterPlanMeta.sourceProfilePresetId === preset.id ? "border-sky-300 bg-sky-50 text-sky-950" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}
                  >
                    <span className="block font-semibold">{preset.name}</span>
                    <span className="mt-1 block text-xs leading-5 text-zinc-500">{preset.description}</span>
                    {preset.isHistoricalExample ? <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">примерный профиль</span> : null}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => onChange({ ...waterPlanMeta, setupEnabled: true, sourceProfileMode: "manual", sourceProfile: source })}
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Ввести вручную
              </button>
              {waterPlanMeta.sourceProfileMode === "manual" ? (
                <div className="grid grid-cols-3 gap-2 rounded-lg bg-zinc-50 p-3 md:grid-cols-6">
                  {ionKeys.map((key) => (
                    <label key={key} className="text-[11px] font-medium uppercase text-zinc-500">
                      {ionLabels[key]}
                      <input
                        type="number"
                        min={0}
                        value={source[key]}
                        onChange={(event) => updateIon("sourceProfile", key, event.target.value)}
                        className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
                      />
                    </label>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-zinc-900">3. Какой результат нужен?</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {builtInTargetWaterProfiles.map((preset) => {
                  const mode = preset.id === "light_malty" ? "malty" : preset.id === "light_hoppy" ? "hoppy" : "balanced";
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyTargetPreset(preset.id, mode)}
                      className={`rounded-lg border px-3 py-3 text-left text-sm ${waterPlanMeta.targetProfilePresetId === preset.id ? "border-sky-300 bg-sky-50 text-sky-950" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}
                    >
                      <span className="block font-semibold">{preset.name}</span>
                      <span className="mt-1 block text-xs leading-5 text-zinc-500">{preset.description}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => onChange({ ...waterPlanMeta, setupEnabled: true, targetProfileMode: "style" })}
                  className={`rounded-lg border px-3 py-3 text-left text-sm ${waterPlanMeta.targetProfileMode === "style" ? "border-sky-300 bg-sky-50 text-sky-950" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}
                >
                  <span className="block font-semibold">По стилю</span>
                  <span className="mt-1 block text-xs leading-5 text-zinc-500">Использует ближайший встроенный стартовый профиль.</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => onChange({ ...waterPlanMeta, setupEnabled: true, targetProfileMode: "manual", targetProfile: target })}
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Вручную
              </button>
              {waterPlanMeta.targetProfileMode === "manual" ? (
                <div className="grid grid-cols-3 gap-2 rounded-lg bg-zinc-50 p-3 md:grid-cols-6">
                  {ionKeys.map((key) => (
                    <label key={key} className="text-[11px] font-medium uppercase text-zinc-500">
                      {ionLabels[key]}
                      <input
                        type="number"
                        min={0}
                        value={target[key]}
                        onChange={(event) => updateIon("targetProfile", key, event.target.value)}
                        className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
                      />
                    </label>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="space-y-3 rounded-xl border border-zinc-100 bg-zinc-50 p-3">
              <h3 className="text-sm font-semibold text-zinc-900">4. Примерные рекомендации по воде</h3>
              <div className="grid gap-3 text-sm text-zinc-700 md:grid-cols-2">
                <div><span className="font-medium text-zinc-950">Вода в затор:</span> {waterPlanResult.waterVolumes.mashWaterL.toFixed(1)} л</div>
                <div><span className="font-medium text-zinc-950">Вода в промывку:</span> {waterPlanResult.waterVolumes.spargeWaterL.toFixed(1)} л</div>
                <div><span className="font-medium text-zinc-950">В затор добавить:</span> {formatAdditions(waterPlanResult.mashSaltAdditions)}</div>
                <div><span className="font-medium text-zinc-950">В промывку добавить:</span> {formatAdditions(waterPlanResult.spargeSaltAdditions)}</div>
                <div>
                  <span className="font-medium text-zinc-950">Кислота в затор:</span>{" "}
                  {waterPlanResult.mashAcidAddition ? `${waterPlanResult.mashAcidAddition.label} ${waterPlanResult.mashAcidAddition.mashAcidMl.toFixed(2)} мл` : "не нужна"}
                </div>
                <div>
                  <span className="font-medium text-zinc-950">Примерный расчет pH:</span>{" "}
                  {waterPlanResult.predictedMashPhAfterAcid20C != null ? waterPlanResult.predictedMashPhAfterAcid20C.toFixed(2) : "—"}
                </div>
                <div className="md:col-span-2">
                  <span className="font-medium text-zinc-950">Итоговый профиль:</span> {formatProfile(waterPlanResult.finalProfile)}
                </div>
                <div className="md:col-span-2">
                  <span className="font-medium text-zinc-950">SO4:Cl:</span> {waterPlanResult.sulfateChlorideRatio ?? "—"}{" "}
                  <span className="text-zinc-500">Больше SO4 обычно суше и хмелевее, больше Cl обычно мягче и солодовее.</span>
                </div>
              </div>

              <div className="rounded-lg border border-sky-100 bg-white px-3 py-2 text-xs leading-5 text-zinc-600">
                Кислота нужна, чтобы снизить pH затора или промывочной воды. Кислоту для затора добавляют в mash water перед внесением зерна; кислоту для промывки добавляют отдельно в sparge water.
              </div>

              <div className="rounded-lg border border-zinc-200 bg-white p-3">
                <label className="flex items-start gap-2 text-sm font-medium text-zinc-800">
                  <input
                    type="checkbox"
                    checked={waterPlanMeta.spargeAcidificationEnabled ?? false}
                    onChange={(event) => onChange({ ...waterPlanMeta, spargeAcidificationEnabled: event.target.checked })}
                    className="mt-1 h-4 w-4 rounded border-zinc-300"
                  />
                  Подкисление промывочной воды
                </label>
                {waterPlanMeta.spargeAcidificationEnabled ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className="text-xs font-medium text-zinc-600">
                      Исходный pH воды
                      <input
                        type="number"
                        min={0}
                        max={14}
                        step={0.01}
                        value={waterPlanMeta.spargeSourcePh ?? source.ph ?? 7}
                        onChange={(event) => onChange({ ...waterPlanMeta, spargeSourcePh: toOptionalNumber(event.target.value) })}
                        className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
                      />
                    </label>
                    <label className="text-xs font-medium text-zinc-600">
                      Целевой pH промывки
                      <input
                        type="number"
                        min={4}
                        max={7}
                        step={0.01}
                        value={waterPlanMeta.targetSpargePh ?? 5.7}
                        onChange={(event) => onChange({ ...waterPlanMeta, targetSpargePh: toOptionalNumber(event.target.value) ?? 5.7 })}
                        className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
                      />
                    </label>
                    <div className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                      <span className="block font-medium text-zinc-800">Кислота в промывку</span>
                      {waterPlanResult.spargeAcidAddition
                        ? `${waterPlanResult.spargeAcidAddition.label} ${waterPlanResult.spargeAcidAddition.spargeAcidMl.toFixed(2)} мл`
                        : "—"}
                    </div>
                  </div>
                ) : null}
              </div>

              {visibleWarnings.length ? (
                <div className="space-y-1 text-xs text-amber-700">
                  {visibleWarnings.map((warning) => <p key={warning}>{waterWarningLabels[warning] ?? warning}</p>)}
                </div>
              ) : null}
            </section>

            <details className="rounded-xl border border-zinc-100 bg-white p-3">
              <summary className="cursor-pointer text-sm font-semibold text-zinc-800">5. Показать расширенные настройки</summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-xs font-medium text-zinc-600">
                  Схема расчета
                  <select
                    value={waterPlanMeta.engine}
                    onChange={(event) => onChange({ ...waterPlanMeta, engine: event.target.value as RecipeWaterPlanMeta["engine"] })}
                    className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  >
                    {recipeWaterEngineModes.map((mode) => (
                      <option key={mode} value={mode}>{calculationModeLabels[mode]}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-zinc-600">
                  Модель pH
                  <select
                    value={waterPlanMeta.phModel}
                    onChange={(event) => onChange({ ...waterPlanMeta, phModel: event.target.value as RecipeWaterPlanMeta["phModel"] })}
                    className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  >
                    {recipeMashPhModels.map((model) => (
                      <option key={model} value={model}>{recipeMashPhModelLabels[model]}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-zinc-600">
                  Кислота
                  <select
                    value={selectedAcid}
                    onChange={(event) => onChange({ ...waterPlanMeta, selectedAcid: event.target.value as RecipeWaterPlanMeta["selectedAcid"] })}
                    className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  >
                    {Object.entries(acidLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-zinc-600">
                  Концентрация кислоты, %
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step={0.1}
                    value={waterPlanMeta.acidConcentrationPct ?? ""}
                    onChange={(event) => onChange({ ...waterPlanMeta, acidConcentrationPct: toOptionalNumber(event.target.value) })}
                    className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                    placeholder={selectedAcid === "lactic_acid" ? "88" : "85"}
                  />
                </label>
                <label className="flex items-start gap-2 text-sm text-zinc-700 md:col-span-2">
                  <input
                    type="checkbox"
                    checked={waterPlanMeta.showWaterAdditivesInIngredients ?? false}
                    onChange={(event) => onChange({ ...waterPlanMeta, showWaterAdditivesInIngredients: event.target.checked })}
                    className="mt-1 h-4 w-4 rounded border-zinc-300"
                  />
                  <span>Показывать добавки воды в списке ингредиентов</span>
                </label>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold text-zinc-700">Ручные добавки солей</h4>
                  <button
                    type="button"
                    onClick={() => onChange({
                      ...waterPlanMeta,
                      engine: "advanced_manual",
                      manualSaltAdditions: [...(waterPlanMeta.manualSaltAdditions ?? []), { salt: "gypsum", grams: 0 }]
                    })}
                    className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                  >
                    + Добавить
                  </button>
                </div>
                {(waterPlanMeta.manualSaltAdditions ?? []).map((addition, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[1fr_120px]">
                    <select
                      value={addition.salt}
                      onChange={(event) => updateManualSalt(index, { salt: event.target.value })}
                      className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
                    >
                      {saltOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={addition.grams}
                      onChange={(event) => updateManualSalt(index, { grams: Number(event.target.value || 0) })}
                      className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
                    />
                  </div>
                ))}
                <p className="text-xs text-zinc-500">Chalk и slaked lime оставлены для опытных сценариев из-за растворимости и риска перелета по щелочности.</p>
              </div>
            </details>
          </>
        ) : null}
      </div>
    </details>
  );
}
