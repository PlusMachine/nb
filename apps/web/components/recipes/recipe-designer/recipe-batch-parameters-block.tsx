"use client";

import { getBeerStyleById, getBjcpStyleDisplayName, srmToEbc } from "@nb/brewing-core";
import React from "react";

import { NumericInput } from "@/components/shared/numeric-input";
import { type EquipmentProfileDto } from "@/features/equipment-profiles/contracts";
import { type InventoryUnit } from "@/features/inventory/units";
import { type RecipeCalculationMeta, type RecipeDraftPreviewDto } from "@/features/recipes/contracts";
import { beerColorFromSrm } from "@/features/recipes/beer-color";
import { formatGravity, formatGravitySecondary, type PreferredGravityUnit } from "@/features/system/gravity-units";
import { BeerGlassIcon } from "@/components/recipes/beer-glass-icon";
import { resolveRecipeFgHelperText, resolveRecipeFgSourceLabel } from "@/features/recipes/fg-estimate";

import { formatEquipmentProfilePercentValue, formatEquipmentProfileLitersValue } from "./helpers";
import { FgSettingsPopover } from "./fg-settings-popover";

// Числовые поля партии держат 3 знака — ширину колонки задаёт подпись, а не поле,
// поэтому остаток строки достаётся селекту оборудования с длинными именами профилей.
const numericFieldWidthClass = "w-[92px]";
const numericInputClass = "h-9 w-full rounded-lg border border-border bg-card px-2.5 pr-7 text-base tabular-nums text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm";

// Ф11: «+ Создать профиль…» — сентинел-значение опции селекта, а не profileId.
const CREATE_EQUIPMENT_PROFILE_OPTION_VALUE = "__create__";

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
  onCreateEquipmentProfile,
  isInheritedEquipmentSnapshot,
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
  /** «+ Создать профиль…» — открывает форму создания в новой вкладке (Ф11). */
  onCreateEquipmentProfile: () => void;
  /** Снапшот унаследован от рецепта (чужой/недоступный профиль) — селект не должен врать «Без профиля». */
  isInheritedEquipmentSnapshot: boolean;
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
    : isInheritedEquipmentSnapshot
      ? "Оборудование автора рецепта"
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
    {
      key: "og",
      label: "НП",
      value: formatGravity(preview?.og ?? null, preferredGravityUnit),
      secondaryValue: formatGravitySecondary(preview?.og ?? null, preferredGravityUnit)
    },
    {
      key: "fg",
      label: "КП",
      value: formatGravity(preview?.fg ?? null, preferredGravityUnit),
      secondaryValue: formatGravitySecondary(preview?.fg ?? null, preferredGravityUnit),
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
          className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg text-[13px] leading-none text-muted-foreground transition-colors before:absolute before:-inset-2 before:content-[''] hover:bg-accent hover:text-foreground"
          aria-label="Открыть настройки расчета горечи"
        >
          ⚙
        </button>
      )
    },
    { key: "abv", label: "ABV", value: preview?.abv != null ? `${preview.abv.toFixed(1)}%` : "—" },
    { key: "style", label: "Стиль", value: selectedStyle ? getBjcpStyleDisplayName(selectedStyle) : "Вне BJCP" }
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_1px_3px_0_rgb(0_0_0_/_0.04)]">
      <div className="border-b border-border bg-muted/40 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Параметры партии</h3>
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
                className="group relative min-w-0 rounded-xl border border-border bg-muted/80 px-3 py-2.5"
              >
                <dt className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  <span className="truncate">{item.label}</span>
                  {"settingsControl" in item && item.settingsControl ? (
                    <span className="ml-auto shrink-0">{item.settingsControl}</span>
                  ) : null}
                </dt>
                {isColor && item.value && typeof item.value === "object" ? (
                  <dd className="mt-1 flex min-w-0 items-center gap-1.5">
                    {colorInfo ? (
                      <BeerGlassIcon color={colorInfo.hex} size={22} className="shrink-0 text-muted-foreground" />
                    ) : null}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold tabular-nums text-foreground">
                        <span>{item.value.srm} <span className="text-xs font-medium text-muted-foreground">SRM</span></span>
                        {" / "}
                        <span>{item.value.ebc} <span className="text-xs font-medium text-muted-foreground">EBC</span></span>
                      </div>
                      {colorInfo ? (
                        <div className="truncate text-xs text-muted-foreground">{colorInfo.label}</div>
                      ) : null}
                    </div>
                  </dd>
                ) : isStyle ? (
                  <dd className="mt-1 min-w-0" title={typeof item.value === "string" ? item.value : undefined}>
                    <div>
                      <div className="truncate text-sm font-semibold text-foreground">{typeof item.value === "string" ? item.value : "—"}</div>
                      {selectedStyle?.bjcpId && selectedStyle.bjcpId !== "LEGACY" ? (
                        <div className="truncate text-[11px] font-medium text-muted-foreground">
                          BJCP {selectedStyle.bjcpId}
                        </div>
                      ) : null}
                    </div>
                  </dd>
                ) : isGravity ? (
                  <dd className="mt-1 min-w-0">
                    <div className="text-sm font-semibold tabular-nums text-foreground">
                      {typeof item.value === "string" ? item.value : "—"}
                    </div>
                    {"secondaryValue" in item && item.secondaryValue ? (
                      <div className="text-[11px] tabular-nums text-muted-foreground">{item.secondaryValue}</div>
                    ) : null}
                    {"sourceLabel" in item && item.sourceLabel ? (
                      <div className="mt-1 text-[11px] font-medium text-muted-foreground">{item.sourceLabel}</div>
                    ) : null}
                    {"helperText" in item && item.helperText ? (
                      <div className="mt-1 text-[11px] text-muted-foreground">{item.helperText}</div>
                    ) : null}
                  </dd>
                ) : (
                  <dd className="mt-1">
                    <div className="text-base font-semibold tabular-nums text-foreground">
                      {typeof item.value === "string" ? item.value : "—"}
                    </div>
                    {"sourceLabel" in item && item.sourceLabel ? (
                      <div className="mt-1 text-[11px] font-medium text-muted-foreground">{item.sourceLabel}</div>
                    ) : null}
                    {"helperText" in item && item.helperText ? (
                      <div className="mt-1 text-[11px] text-muted-foreground">{item.helperText}</div>
                    ) : null}
                  </dd>
                )}
              </div>
            );
          })}
        </dl>

        <div className="mt-auto space-y-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Объём, л
              <NumericInput withSteppers wrapperClassName={numericFieldWidthClass} min={0.1} max={10000} step={1} value={batchSize.quantity} onChange={(event) => setBatchSize((current) => ({ ...current, quantity: event.target.value }))} className={numericInputClass} />
              {sectionErrors.batchSizeEnteredQuantity ? <span className="block text-xs normal-case tracking-normal text-destructive">{sectionErrors.batchSizeEnteredQuantity}</span> : null}
            </label>
            <label className="space-y-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Эффективность, %
              <NumericInput withSteppers wrapperClassName={numericFieldWidthClass} min={1} max={100} step={1} value={efficiency} onChange={(event) => setEfficiency(event.target.value)} className={numericInputClass} />
              {sectionErrors.efficiency ? <span className="block text-xs normal-case tracking-normal text-destructive">{sectionErrors.efficiency}</span> : null}
            </label>
            <label className="space-y-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Кипячение, мин
              <NumericInput withSteppers wrapperClassName={numericFieldWidthClass} integer min={1} max={600} step={5} value={boilTimeMinutes} onChange={(event) => setBoilTimeMinutes(event.target.value)} className={numericInputClass} />
              {sectionErrors.boilTimeMinutes ? <span className="block text-xs normal-case tracking-normal text-destructive">{sectionErrors.boilTimeMinutes}</span> : null}
            </label>
            <label className="min-w-0 flex-1 basis-48 space-y-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Оборудование
              <select
                value={equipmentProfileSelectValue}
                onChange={(event) => {
                  if (event.target.value === CREATE_EQUIPMENT_PROFILE_OPTION_VALUE) {
                    // Нативный select иначе залипнет на «+ Создать профиль…» — откатываем
                    // немедленно, до следующего React-рендера (состояние выбора не менялось).
                    event.target.value = equipmentProfileSelectValue;
                    onCreateEquipmentProfile();
                    return;
                  }
                  onSelectEquipmentProfile(event.target.value || null);
                }}
                className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-base normal-case tracking-normal text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
              >
                <option value={equipmentProfileSelectValue} hidden>{selectedEquipmentProfileLabel}</option>
                <option value="">Без профиля — ручной ввод параметров</option>
                {equipmentProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}{profile.isDefault ? " · Основной" : ""} — {formatEquipmentProfileLitersValue(profile.targetBatchVolumeL)} · {formatEquipmentProfilePercentValue(profile.brewhouseEfficiencyPct)}
                  </option>
                ))}
                <option value={CREATE_EQUIPMENT_PROFILE_OPTION_VALUE}>+ Создать профиль…</option>
              </select>
            </label>
          </div>

          {canRescaleToVolume ? (
            <button
              type="button"
              onClick={onRescaleToVolume}
              className="inline-flex items-center rounded-lg border border-border bg-muted/60 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              Пересчитать ингредиенты под {batchSize.quantity} л
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
