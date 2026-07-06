"use client";

import React from "react";
import { Settings } from "lucide-react";

import { Dialog, DialogCloseButton } from "@nb/ui";
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
  const whirlpoolEnabled = calculationMeta.bitternessFormula === "tinseth_whirlpool_v2";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Настройки расчета горечи"
      hideTitle
      size="lg"
    >
      <div className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Настройки расчета горечи</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">По умолчанию используется Tinseth с учетом whirlpool и плотности на момент добавления.</p>
            </div>
          </div>
          <DialogCloseButton />
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-medium text-muted-foreground">
            Формула IBU
            <select
              value={calculationMeta.bitternessFormula}
              onChange={(event) => onChange({
                ...calculationMeta,
                bitternessFormula: event.target.value as RecipeCalculationMeta["bitternessFormula"]
              })}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
            >
              {recipeBitternessFormulas.map((formula) => (
                <option key={formula} value={formula}>{recipeBitternessFormulaLabels[formula]}</option>
              ))}
            </select>
          </label>

          <label className="flex items-start gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={whirlpoolEnabled}
              onChange={(event) => onChange({
                ...calculationMeta,
                bitternessFormula: event.target.checked ? "tinseth_whirlpool_v2" : "tinseth_classic"
              })}
              className="mt-1 h-4 w-4 rounded border-border"
            />
            <span>
              <span className="block font-medium text-foreground">Учитывать whirlpool</span>
              <span className="text-xs text-muted-foreground">Whirlpool/hopstand добавки будут давать вклад в IBU через температурный коэффициент.</span>
            </span>
          </label>

          <label className="flex items-start gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
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
              className="mt-1 h-4 w-4 rounded border-border"
            />
            <span>
              <span className="block font-medium text-foreground">Учитывать carryover позднего хмеля</span>
              <span className="text-xs text-muted-foreground">Практическая оценка для хмеля, который попал в котел незадолго до flameout.</span>
            </span>
          </label>

          <label className="block text-xs font-medium text-muted-foreground">
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
              className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
            >
              <option value="bonus_10pct">+10% к обычному кипячению</option>
              <option value="treat_as_20min">Считать как 20 минут</option>
              <option value="treat_as_boil_start">Считать как начало кипячения</option>
            </select>
          </label>

          <p className="rounded-lg bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">Dry hop по умолчанию не входит в стандартный IBU total, но может менять воспринимаемую горечь.</p>
        </div>
      </div>
    </Dialog>
  );
}
