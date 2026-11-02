"use client";

import React, { useRef, useState } from "react";
import { gravityToSg, sgToGravityUnit } from "@nb/brewing-core";
import { Button } from "@nb/ui";
import { NumericInput } from "@/components/shared/numeric-input";
import { formatGravity, gravityUnitLabels, toCalculatorGravityUnit, type PreferredGravityUnit } from "@/features/system/gravity-units";
import { GRAVITY_SG_MAX, GRAVITY_SG_MIN } from "../contracts";
import type { BrewDayProgressController } from "./use-brew-day-progress";

export function ManualBrewTransfer({ controller, preferredGravityUnit, targetOgSg, initialFermenterL }: {
  controller: BrewDayProgressController; preferredGravityUnit: PreferredGravityUnit; targetOgSg: number | null; initialFermenterL: number | null;
}) {
  const [gravity, setGravity] = useState("");
  const [volume, setVolume] = useState(initialFermenterL == null ? "" : String(initialFermenterL));
  const [error, setError] = useState<string | null>(null);
  const operationId = useRef<string | null>(null);
  const unit = toCalculatorGravityUnit(preferredGravityUnit);
  const busy = Boolean(controller.pending["brew:transfer"]);
  return <form className="space-y-4" onSubmit={async event => {
    event.preventDefault();
    const gravitySg = gravity.trim() ? gravityToSg(Number(gravity.replace(",", ".")), unit) : null;
    const fermenterL = volume.trim() ? Number(volume.replace(",", ".")) : null;
    if (gravitySg === null && fermenterL === null) { setError("Введите хотя бы один замер или продолжите без замеров."); return; }
    if (gravitySg !== null && (!Number.isFinite(gravitySg) || gravitySg < GRAVITY_SG_MIN || gravitySg > GRAVITY_SG_MAX)) { setError(`Плотность — от ${formatGravity(GRAVITY_SG_MIN, preferredGravityUnit)} до ${formatGravity(GRAVITY_SG_MAX, preferredGravityUnit)}.`); return; }
    if (fermenterL !== null && (!Number.isFinite(fermenterL) || fermenterL <= 0 || fermenterL > 10000)) { setError("Введите объём больше нуля и не больше 10 000 л."); return; }
    setError(null);
    operationId.current ??= crypto.randomUUID();
    await controller.patchStep("brew:transfer", { done: true, skipped: false, transfer: { operationId: operationId.current, takenAt: new Date().toISOString(), gravitySg, fermenterL } });
  }}>
    <p className="text-sm">Измерьте плотность до внесения дрожжей.</p>
    {targetOgSg != null ? <p className="text-xs text-muted-foreground">По рецепту: {formatGravity(targetOgSg, preferredGravityUnit)}</p> : null}
    <label className="block text-sm">Начальная плотность, {gravityUnitLabels[preferredGravityUnit]}
      <NumericInput value={gravity} onChange={event => { setGravity(event.target.value); operationId.current = null; }} min={sgToGravityUnit(GRAVITY_SG_MIN, unit)} max={sgToGravityUnit(GRAVITY_SG_MAX, unit)} step={preferredGravityUnit === "sg" ? 0.001 : 0.1} disabled={busy} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base" />
    </label>
    <label className="block text-sm">Объём в ферментере, л
      <NumericInput value={volume} onChange={event => { setVolume(event.target.value); operationId.current = null; }} min={0} max={10000} step={0.1} disabled={busy} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base" />
    </label>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <Button type="submit" variant="primary" className="w-full" disabled={busy}>Сохранить и продолжить</Button>
    <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => controller.patchStep("brew:transfer", { done: true, skipped: true })}>Продолжить без замеров</Button>
  </form>;
}
