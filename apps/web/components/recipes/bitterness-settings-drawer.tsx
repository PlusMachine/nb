"use client";

import React, { useEffect } from "react";
import { Settings, X } from "lucide-react";

import {
  recipeBitternessFormulaLabels,
  recipeBitternessFormulas,
  type RecipeCalculationMeta
} from "@/features/recipes/contracts";

export function BitternessSettingsDrawer({
  open,
  calculationMeta,
  onChange,
  onClose
}: {
  open: boolean;
  calculationMeta: RecipeCalculationMeta;
  onChange: (next: RecipeCalculationMeta) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const whirlpoolEnabled = calculationMeta.bitternessFormula === "tinseth_whirlpool_v2";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/45 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Настройки расчета горечи" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-950">Настройки расчета горечи</h3>
              <p className="mt-1 text-sm leading-6 text-zinc-600">По умолчанию используется Tinseth с учетом whirlpool и плотности на момент добавления.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-medium text-zinc-600">
            Формула IBU
            <select
              value={calculationMeta.bitternessFormula}
              onChange={(event) => onChange({
                ...calculationMeta,
                bitternessFormula: event.target.value as RecipeCalculationMeta["bitternessFormula"]
              })}
              className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
            >
              {recipeBitternessFormulas.map((formula) => (
                <option key={formula} value={formula}>{recipeBitternessFormulaLabels[formula]}</option>
              ))}
            </select>
          </label>

          <label className="flex items-start gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={whirlpoolEnabled}
              onChange={(event) => onChange({
                ...calculationMeta,
                bitternessFormula: event.target.checked ? "tinseth_whirlpool_v2" : "tinseth_classic"
              })}
              className="mt-1 h-4 w-4 rounded border-zinc-300"
            />
            <span>
              <span className="block font-medium text-zinc-900">Учитывать whirlpool</span>
              <span className="text-xs text-zinc-500">Whirlpool/hopstand добавки будут давать вклад в IBU через температурный коэффициент.</span>
            </span>
          </label>

          <label className="flex items-start gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={calculationMeta.bitternessSettings.includeBoilCarryoverIntoWhirlpool ?? true}
              onChange={(event) => onChange({
                ...calculationMeta,
                bitternessSettings: {
                  ...calculationMeta.bitternessSettings,
                  includeBoilCarryoverIntoWhirlpool: event.target.checked
                }
              })}
              className="mt-1 h-4 w-4 rounded border-zinc-300"
            />
            <span>
              <span className="block font-medium text-zinc-900">Учитывать carryover позднего хмеля</span>
              <span className="text-xs text-zinc-500">Практическая оценка для хмеля, который попал в котел незадолго до flameout.</span>
            </span>
          </label>

          <label className="block text-xs font-medium text-zinc-600">
            FWH mode
            <select
              value={calculationMeta.bitternessSettings.firstWortHopMode ?? "bonus_10pct"}
              onChange={(event) => onChange({
                ...calculationMeta,
                bitternessSettings: {
                  ...calculationMeta.bitternessSettings,
                  firstWortHopMode: event.target.value as NonNullable<RecipeCalculationMeta["bitternessSettings"]["firstWortHopMode"]>
                }
              })}
              className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
            >
              <option value="bonus_10pct">+10% к обычному кипячению</option>
              <option value="treat_as_20min">Считать как 20 минут</option>
              <option value="treat_as_boil_start">Считать как начало кипячения</option>
            </select>
          </label>

          <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-500">Dry hop по умолчанию не входит в стандартный IBU total, но может менять воспринимаемую горечь.</p>
        </div>
      </div>
    </div>
  );
}
