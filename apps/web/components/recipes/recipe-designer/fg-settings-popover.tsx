"use client";

import { gravityToSg, sgToGravityUnit } from "@nb/brewing-core";
import React, { useEffect, useState } from "react";

import { Popover } from "@nb/ui";
import { type RecipeCalculationMeta, type RecipeDraftPreviewDto } from "@/features/recipes/contracts";
import {
  formatGravityRange,
  gravityUnitLabels,
  toCalculatorGravityUnit,
  type PreferredGravityUnit
} from "@/features/system/gravity-units";

import { toInputString, toOptionalNumber } from "./helpers";

export const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const formatSignedPctPoints = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)} п.п.`;

export function FgSettingsPopover({
  preview,
  calculationMeta,
  onChange,
  preferredGravityUnit
}: {
  preview: RecipeDraftPreviewDto | null;
  calculationMeta: RecipeCalculationMeta;
  onChange: React.Dispatch<React.SetStateAction<RecipeCalculationMeta>>;
  preferredGravityUnit: PreferredGravityUnit;
}) {
  const manualFgUnit = toCalculatorGravityUnit(preferredGravityUnit);
  const manualFgPrecision = preferredGravityUnit === "sg" ? 3 : 1;
  const manualFgMin = preferredGravityUnit === "sg" ? 0.99 : 0;
  const manualFgMax = preferredGravityUnit === "sg" ? 1.2 : Math.round(sgToGravityUnit(1.2, manualFgUnit));
  const manualFgStep = preferredGravityUnit === "sg" ? 0.001 : 0.1;
  const sgToManualFgInput = (sg: number | null) => (
    sg == null ? null : sgToGravityUnit(sg, manualFgUnit)
  );

  const [manualFgEnabled, setManualFgEnabled] = useState(Boolean(calculationMeta.manualFgOverrideValue != null));
  const [manualAttenuationInput, setManualAttenuationInput] = useState(
    toInputString(calculationMeta.manualAttenuationOverridePct ?? null)
  );
  const [manualFgInput, setManualFgInput] = useState(
    toInputString(sgToManualFgInput(calculationMeta.manualFgOverrideValue ?? null))
  );

  useEffect(() => {
    if (calculationMeta.manualFgOverrideValue != null) {
      setManualFgEnabled(true);
    }
  }, [calculationMeta.manualFgOverrideValue]);

  useEffect(() => {
    setManualAttenuationInput(toInputString(calculationMeta.manualAttenuationOverridePct ?? null));
  }, [calculationMeta.manualAttenuationOverridePct]);

  useEffect(() => {
    setManualFgInput(toInputString(sgToManualFgInput(calculationMeta.manualFgOverrideValue ?? null)));
  }, [calculationMeta.manualFgOverrideValue, preferredGravityUnit]);

  const commitManualAttenuation = () => {
    const parsed = toOptionalNumber(manualAttenuationInput);
    const nextValue = parsed == null || !Number.isFinite(parsed)
      ? null
      : clampNumber(parsed, 60, 90);

    setManualAttenuationInput(toInputString(nextValue));
    onChange((current) => ({
      ...current,
      manualAttenuationOverridePct: nextValue
    }));
  };

  const commitManualFg = () => {
    const parsed = toOptionalNumber(manualFgInput);
    const parsedSg = parsed == null || !Number.isFinite(parsed) ? null : gravityToSg(parsed, manualFgUnit);
    const nextValue = parsedSg == null ? null : clampNumber(parsedSg, 0.99, 1.2);

    setManualFgInput(toInputString(sgToManualFgInput(nextValue)));
    onChange((current) => ({
      ...current,
      manualFgOverrideValue: nextValue
    }));
  };

  return (
    <Popover
      align="end"
      trigger={({ open }) => (
        <button
          type="button"
          className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-[13px] leading-none transition-colors hover:bg-zinc-100 hover:text-zinc-700 ${open ? "bg-zinc-100 text-zinc-700" : "text-zinc-400"}`}
          aria-label="Открыть настройки КП"
        >
          ⚙
        </button>
      )}
      onOpenChange={(open) => {
        if (!open) {
          commitManualAttenuation();
          if (manualFgEnabled) {
            commitManualFg();
          }
        }
      }}
    >
      {({ close }) => (
        <div className="w-[min(20rem,calc(100vw-2.5rem))] normal-case tracking-normal">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-zinc-900">Прогноз КП</h4>
            </div>
            <button
              type="button"
              onClick={close}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-sm text-zinc-300 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="Закрыть настройки КП"
            >
              ×
            </button>
          </div>

          <div className="mt-2.5 space-y-2.5">
            <label className="space-y-1 text-[11px] font-medium text-zinc-500">
              Ожидаемая attenuation, %
              <input
                type="number"
                min={60}
                max={90}
                step={0.1}
                disabled={manualFgEnabled}
                value={manualAttenuationInput}
                onChange={(event) => setManualAttenuationInput(event.target.value)}
                onBlur={commitManualAttenuation}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
                className={`h-9 w-full rounded-lg border px-2.5 text-sm tabular-nums shadow-sm ${manualFgEnabled
                  ? "border-zinc-100 bg-zinc-50 text-zinc-400"
                  : "border-zinc-200 bg-white text-zinc-900"
                  }`}
                placeholder="Например, 75"
              />
              <span className="block text-[11px] font-normal text-zinc-400">
                Пусто — использовать авторасчет
              </span>
            </label>

            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-[11px] font-medium text-zinc-600">
                <input
                  type="checkbox"
                  checked={manualFgEnabled}
                  onChange={(event) => {
                    const nextEnabled = event.target.checked;
                    setManualFgEnabled(nextEnabled);
                    if (nextEnabled) {
                      setManualFgInput(toInputString(sgToManualFgInput(calculationMeta.manualFgOverrideValue ?? preview?.fg ?? null)));
                    } else {
                      setManualFgInput("");
                      onChange((current) => ({
                        ...current,
                        manualFgOverrideValue: null
                      }));
                    }
                  }}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                Зафиксировать КП вручную
              </label>

              {manualFgEnabled ? (
                <div className="space-y-1">
                  <span className="block text-[11px] font-medium text-zinc-500">
                    Плотность ({gravityUnitLabels[preferredGravityUnit]})
                  </span>
                  <input
                    type="number"
                    min={manualFgMin}
                    max={manualFgMax}
                    step={manualFgStep}
                    value={manualFgInput}
                    onChange={(event) => setManualFgInput(event.target.value)}
                    onBlur={commitManualFg}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                    className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm tabular-nums text-zinc-900 shadow-sm"
                    placeholder={(sgToManualFgInput(preview?.fg ?? 1.012) ?? 0).toFixed(manualFgPrecision)}
                  />
                </div>
              ) : null}
            </div>

            {preview?.fgEstimateDetails ? (
              <div className="space-y-1 border-t border-zinc-100 pt-2.5 text-[11px] text-zinc-500">
                <div className="flex items-center justify-between gap-2">
                  <span>База {preview.fgEstimateDetails.attenuationSource === "yeast" ? "по дрожжам" : "по умолчанию"}</span>
                  <span className="font-medium tabular-nums text-zinc-700">{preview.fgEstimateDetails.baseAttenuationPct.toFixed(1)}%</span>
                </div>
                {preview.fgEstimateDetails.mainMashTempC != null && preview.fgEstimateDetails.mashAdjPctPoints !== 0 ? (
                  <div className="flex items-center justify-between gap-2">
                    <span>Поправка по затору ({preview.fgEstimateDetails.mainMashTempC}°C)</span>
                    <span className="font-medium tabular-nums text-zinc-700">{formatSignedPctPoints(preview.fgEstimateDetails.mashAdjPctPoints)}</span>
                  </div>
                ) : null}
                {preview.fgEstimateDetails.simpleSugarAdj > 0 ? (
                  <div className="flex items-center justify-between gap-2">
                    <span>Простые сахара ({preview.fgEstimateDetails.simpleSugarSharePct.toFixed(0)}%)</span>
                    <span className="font-medium tabular-nums text-zinc-700">{formatSignedPctPoints(preview.fgEstimateDetails.simpleSugarAdj)}</span>
                  </div>
                ) : null}
                {preview.fgEstimateDetails.crystalDextrinAdj > 0 ? (
                  <div className="flex items-center justify-between gap-2">
                    <span>Карамельные / декстрины ({preview.fgEstimateDetails.crystalDextrinSharePct.toFixed(0)}%)</span>
                    <span className="font-medium tabular-nums text-zinc-700">{formatSignedPctPoints(-preview.fgEstimateDetails.crystalDextrinAdj)}</span>
                  </div>
                ) : null}
                {preview.fgEstimateDetails.lactoseAdj > 0 ? (
                  <div className="flex items-center justify-between gap-2">
                    <span>Лактоза ({preview.fgEstimateDetails.lactoseSharePct.toFixed(0)}%)</span>
                    <span className="font-medium tabular-nums text-zinc-700">{formatSignedPctPoints(-preview.fgEstimateDetails.lactoseAdj)}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-2 border-t border-zinc-100 pt-1 font-medium text-zinc-700">
                  <span>Итоговая attenuation</span>
                  <span className="tabular-nums">{preview.fgEstimateDetails.effectiveAttenuationPct.toFixed(1)}%</span>
                </div>
                {(() => {
                  const rangeText = formatGravityRange(
                    preview.fgEstimateDetails.fgRangeMin ?? null,
                    preview.fgEstimateDetails.fgRangeMax ?? null,
                    preferredGravityUnit
                  );
                  return rangeText ? (
                    <div className="flex items-center justify-between gap-2">
                      <span>Диапазон КП</span>
                      <span className="font-medium tabular-nums text-zinc-700">{rangeText}</span>
                    </div>
                  ) : null;
                })()}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </Popover>
  );
}
