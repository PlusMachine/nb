"use client";

import { getBeerStyleById, srmToEbc } from "@nb/brewing-core";
import React from "react";

import { NumericInput } from "@/components/shared/numeric-input";
import { type EquipmentProfileDto } from "@/features/equipment-profiles/contracts";
import { type InventoryUnit } from "@/features/inventory/units";
import { type RecipeCalculationMeta, type RecipeDraftPreviewDto } from "@/features/recipes/contracts";
import { beerColorFromSrm } from "@/features/recipes/beer-color";
import { formatGravity, type PreferredGravityUnit } from "@/features/system/gravity-units";
import { BeerGlassIcon } from "@/components/recipes/beer-glass-icon";
import { resolveRecipeFgHelperText, resolveRecipeFgSourceLabel } from "@/features/recipes/fg-estimate";

import { formatEquipmentProfilePercentValue, formatEquipmentProfileLitersValue } from "./helpers";
import { FgSettingsPopover } from "./fg-settings-popover";

export function RecipeBatchParametersBlock({
  batchSize,
  setBatchSize,
  efficiency,
  setEfficiency,
  boilTimeMinutes,
  setBoilTimeMinutes,
  styleId,
  calculationMeta,
  setCalculationMeta,
  sectionErrors,
  preview,
  recalculating,
  previewError,
  equipmentProfiles,
  selectedEquipmentProfileId,
  onSelectEquipmentProfile,
  canRescaleToVolume,
  onRescaleToVolume,
  onOpenBitternessSettings,
  preferredGravityUnit
}: {
  batchSize: { quantity: string; unit: InventoryUnit };
  setBatchSize: React.Dispatch<React.SetStateAction<{ quantity: string; unit: InventoryUnit }>>;
  efficiency: string;
  setEfficiency: React.Dispatch<React.SetStateAction<string>>;
  boilTimeMinutes: string;
  setBoilTimeMinutes: React.Dispatch<React.SetStateAction<string>>;
  styleId: string | null;
  calculationMeta: RecipeCalculationMeta;
  setCalculationMeta: React.Dispatch<React.SetStateAction<RecipeCalculationMeta>>;
  sectionErrors: Record<string, string>;
  preview: RecipeDraftPreviewDto | null;
  recalculating: boolean;
  previewError: string | null;
  equipmentProfiles: EquipmentProfileDto[];
  selectedEquipmentProfileId: string | null;
  onSelectEquipmentProfile: (profileId: string | null) => void;
  /** Показать инлайн-действие «Пересчитать под объём» (объём изменился с последнего сохранения). */
  canRescaleToVolume: boolean;
  onRescaleToVolume: () => void;
  onOpenBitternessSettings: () => void;
  preferredGravityUnit: PreferredGravityUnit;
}) {
  const colorSrmValue = preview?.color != null ? preview.color.toFixed(1) : null;
  const colorEbcValue = preview?.color != null ? srmToEbc(preview.color).toFixed(0) : null;
  const colorInfo = preview?.color != null ? beerColorFromSrm(preview.color) : null;
  const selectedStyle = getBeerStyleById(styleId);
  const selectedEquipmentProfile = equipmentProfiles.find((profile) => profile.id === selectedEquipmentProfileId) ?? null;
  const equipmentProfileSelectValue = selectedEquipmentProfile?.id ?? "";
  const selectedEquipmentProfileLabel = selectedEquipmentProfile
    ? selectedEquipmentProfile.name
    : "Без профиля";
  const fgSourceLabel = resolveRecipeFgSourceLabel(preview?.fgEstimateMode, preview?.fgEstimateDetails);
  const fgHelperText = resolveRecipeFgHelperText(preview?.fgEstimateMode, preview?.fg);
  // Числа устарели, пока идёт пересчёт или превью упало с ошибкой — приглушаем,
  // чтобы не выдавать stale-значения за достоверные (#15).
  const metricsStale = recalculating || Boolean(previewError);

  const summaryItems = [
    {
      key: "color",
      label: "Цвет",
      value: colorSrmValue != null && colorEbcValue != null
        ? { srm: colorSrmValue, ebc: colorEbcValue }
        : null
    },
    { key: "og", label: "НП", value: formatGravity(preview?.og ?? null, preferredGravityUnit) },
    {
      key: "fg",
      label: "КП",
      value: formatGravity(preview?.fg ?? null, preferredGravityUnit),
      sourceLabel: preview?.fg != null ? fgSourceLabel : null,
      helperText: preview?.fg == null ? fgHelperText : null,
      settingsControl: (
        <FgSettingsPopover
          preview={preview}
          calculationMeta={calculationMeta}
          onChange={setCalculationMeta}
          preferredGravityUnit={preferredGravityUnit}
        />
      )
    },
    {
      key: "ibu",
      label: "IBU",
      value: preview?.ibu != null ? `${preview.ibu.toFixed(0)}` : "—",
      settingsControl: (
        <button
          type="button"
          onClick={onOpenBitternessSettings}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[13px] leading-none text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="Открыть настройки расчета горечи"
        >
          ⚙
        </button>
      )
    },
    { key: "abv", label: "ABV", value: preview?.abv != null ? `${preview.abv.toFixed(1)}%` : "—" },
    { key: "style", label: "Стиль", value: selectedStyle?.name ?? "Вне BJCP" }
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-[0_1px_3px_0_rgb(0_0_0_/_0.04)]">
      <div className="border-b border-zinc-100 bg-zinc-50/40 px-4 py-3">
        <h3 className="text-sm font-semibold text-zinc-700">Параметры партии</h3>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <dl
          aria-busy={recalculating}
          className={`mb-4 grid grid-cols-2 gap-2 transition-opacity xl:grid-cols-3 ${metricsStale ? "opacity-50" : ""}`}
        >
          {summaryItems.map((item) => {
            const isColor = item.key === "color";
            const isStyle = item.key === "style";
            const isGravity = item.key === "og" || item.key === "fg";

            return (
              <div
                key={item.key}
                className="group relative min-w-0 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2.5"
              >
                <dt className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
                  <span className="truncate">{item.label}</span>
                  {"settingsControl" in item && item.settingsControl ? (
                    <span className="ml-auto shrink-0">{item.settingsControl}</span>
                  ) : null}
                </dt>
                {isColor && item.value && typeof item.value === "object" ? (
                  <dd className="mt-1 flex min-w-0 items-center gap-1.5">
                    {colorInfo ? (
                      <BeerGlassIcon color={colorInfo.hex} size={22} className="shrink-0 text-zinc-300" />
                    ) : null}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold tabular-nums text-zinc-950">
                        <span>{item.value.srm} <span className="text-xs font-medium text-zinc-500">SRM</span></span>
                        {" / "}
                        <span>{item.value.ebc} <span className="text-xs font-medium text-zinc-500">EBC</span></span>
                      </div>
                      {colorInfo ? (
                        <div className="truncate text-xs text-zinc-500">{colorInfo.label}</div>
                      ) : null}
                    </div>
                  </dd>
                ) : isStyle ? (
                  <dd className="mt-1 min-w-0" title={typeof item.value === "string" ? item.value : undefined}>
                    <div>
                      <div className="truncate text-sm font-semibold text-zinc-950">{typeof item.value === "string" ? item.value : "—"}</div>
                      {selectedStyle?.bjcpId && selectedStyle.bjcpId !== "LEGACY" ? (
                        <div className="truncate text-[11px] font-medium text-zinc-500">
                          BJCP {selectedStyle.bjcpId}
                        </div>
                      ) : null}
                    </div>
                  </dd>
                ) : isGravity ? (
                  <dd className="mt-1 min-w-0">
                    <div className="text-sm font-semibold tabular-nums text-zinc-950">
                      {typeof item.value === "string" ? item.value : "—"}
                    </div>
                    {"sourceLabel" in item && item.sourceLabel ? (
                      <div className="mt-1 text-[11px] font-medium text-zinc-500">{item.sourceLabel}</div>
                    ) : null}
                    {"helperText" in item && item.helperText ? (
                      <div className="mt-1 text-[11px] text-zinc-400">{item.helperText}</div>
                    ) : null}
                  </dd>
                ) : (
                  <dd className="mt-1">
                    <div className="text-base font-semibold tabular-nums text-zinc-950">
                      {typeof item.value === "string" ? item.value : "—"}
                    </div>
                    {"sourceLabel" in item && item.sourceLabel ? (
                      <div className="mt-1 text-[11px] font-medium text-zinc-500">{item.sourceLabel}</div>
                    ) : null}
                    {"helperText" in item && item.helperText ? (
                      <div className="mt-1 text-[11px] text-zinc-400">{item.helperText}</div>
                    ) : null}
                  </dd>
                )}
              </div>
            );
          })}
        </dl>

        <div className="mt-auto border-t border-zinc-100 pt-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:items-end">
            <label className="space-y-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Объём
              <div className="relative">
                <NumericInput min={0.1} max={10000} step={0.1} value={batchSize.quantity} onChange={(event) => setBatchSize((current) => ({ ...current, quantity: event.target.value }))} className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 pr-10 text-sm tabular-nums text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200" />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-zinc-400">
                  л
                </span>
              </div>
              {sectionErrors.batchSizeEnteredQuantity ? <span className="block text-xs normal-case tracking-normal text-rose-600">{sectionErrors.batchSizeEnteredQuantity}</span> : null}
              {canRescaleToVolume ? (
                <button
                  type="button"
                  onClick={onRescaleToVolume}
                  className="mt-1 block text-xs font-medium normal-case tracking-normal text-zinc-600 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900"
                >
                  Пересчитать под объём
                </button>
              ) : null}
            </label>
            <label className="space-y-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Эффективность, %
              <NumericInput min={1} max={100} step={0.1} value={efficiency} onChange={(event) => setEfficiency(event.target.value)} className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm tabular-nums text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200" />
              {sectionErrors.efficiency ? <span className="block text-xs normal-case tracking-normal text-rose-600">{sectionErrors.efficiency}</span> : null}
            </label>
            <label className="space-y-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Кипячение, мин
              <NumericInput integer min={1} max={600} step={1} value={boilTimeMinutes} onChange={(event) => setBoilTimeMinutes(event.target.value)} className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm tabular-nums text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200" />
              {sectionErrors.boilTimeMinutes ? <span className="block text-xs normal-case tracking-normal text-rose-600">{sectionErrors.boilTimeMinutes}</span> : null}
            </label>
            <label className="space-y-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Оборудование
              <select
                value={equipmentProfileSelectValue}
                onChange={(event) => onSelectEquipmentProfile(event.target.value || null)}
                className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm normal-case tracking-normal text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
              >
                <option value={equipmentProfileSelectValue} hidden>{selectedEquipmentProfileLabel}</option>
                <option value="">Без профиля — ручной ввод параметров</option>
                {equipmentProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}{profile.isDefault ? " · Основной" : ""} — {formatEquipmentProfileLitersValue(profile.targetBatchVolumeL)} · {formatEquipmentProfilePercentValue(profile.brewhouseEfficiencyPct)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
