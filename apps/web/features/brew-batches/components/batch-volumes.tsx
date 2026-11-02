"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, DialogCloseButton, DialogFooter, DialogHeader } from "@nb/ui";
import { calibrateBatchEquipmentAction, saveBatchVolumesAction } from "@/app/(app)/app/brew-batches/[id]/records-actions";
import { calculateBatchCalibration, volumeLabels, type VolumeMeasurements } from "../records";

const fieldClass = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground sm:text-sm";
const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
export type CalibrationProfile = { id: string; name: string; evaporationRateLPerHr: number; trubChillerLossL: number; coolingShrinkagePct: number; updatedAt: string };

export function BatchCalibration({ brewBatchId, volumes, profile, boilMinutes }: {
  brewBatchId: string; volumes: VolumeMeasurements; profile: CalibrationProfile | null; boilMinutes: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [duration, setDuration] = useState(String(boilMinutes));
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const inFlight = useRef(false);
  const next = profile ? calculateBatchCalibration(volumes, Number(duration.replace(",", ".")), profile.coolingShrinkagePct) : null;
  if (!profile || !calculateBatchCalibration(volumes, boilMinutes, profile.coolingShrinkagePct)) return null;
  return <>
    <Button type="button" variant="outline" size="sm" onClick={() => { setOpen(true); setConfirmed(false); setError(""); }}>Обновить настройки пивоварни</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }} title="Обновить настройки пивоварни" hideTitle size="md">
      <DialogHeader><h2 className="text-base font-semibold">Обновить настройки пивоварни</h2><DialogCloseButton disabled={busy} /></DialogHeader>
      <form onSubmit={async event => {
        event.preventDefault();
        if (inFlight.current || !next || !confirmed) return;
        inFlight.current = true; setBusy(true); setError("");
        try {
          const result = await calibrateBatchEquipmentAction(brewBatchId, { boilMinutes: Number(duration.replace(",", ".")), sameTemperature: confirmed, profileUpdatedAt: profile.updatedAt, volumes });
          if (result.ok) { setOpen(false); router.refresh(); } else setError(result.message);
        } catch { setError("Не удалось сохранить настройки."); } finally { inFlight.current = false; setBusy(false); }
      }}>
        <div className="space-y-4 p-5">
          <p className="text-sm font-medium">{profile.name}</p>
          <label className="block text-sm">Время кипячения, мин<input className={fieldClass} inputMode="decimal" value={duration} onChange={e => { setDuration(e.target.value); setError(""); }} disabled={busy} required /></label>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="py-2 pr-2 font-normal">Параметр</th><th className="px-2 font-normal">Сейчас</th><th className="pl-2 font-normal">По замерам</th></tr></thead><tbody>
            <tr className="border-t border-border"><td className="py-3 pr-2">Выкипание, л/ч</td><td className="px-2 tabular-nums">{fmt(profile.evaporationRateLPerHr)}</td><td className="pl-2 tabular-nums">{next ? fmt(next.evaporationRateLPerHr) : "—"}</td></tr>
            <tr className="border-t border-border"><td className="py-3 pr-2">Потери на осадке и в чиллере, л</td><td className="px-2 tabular-nums">{fmt(profile.trubChillerLossL)}</td><td className="pl-2 tabular-nums">{next ? fmt(next.trubChillerLossL) : "—"}</td></tr>
          </tbody></table></div>
          <p className="text-xs text-muted-foreground">Выкипание рассчитано с учётом уменьшения объёма сусла при охлаждении. Настройки применятся к новым партиям.</p>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-foreground" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy} />Объёмы приведены к 20 °C</label>
          {!next ? <p role="alert" className="text-sm text-destructive">Проверьте время кипячения.</p> : null}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Отмена</Button><Button type="submit" disabled={busy || !confirmed || !next || Number(duration) > 1440}>{busy ? "Сохранение…" : "Сохранить настройки"}</Button></DialogFooter>
      </form>
    </Dialog>
  </>;
}

export function BatchVolumes({ brewBatchId, volumes, stage, calibration }: {
  brewBatchId: string; volumes: VolumeMeasurements; stage: "brew" | "bottling"; calibration?: { profile: CalibrationProfile | null; boilMinutes: number };
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(volumes).map(([key, value]) => [key, value == null ? "" : String(value).replace(".", ",")])) ), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const inFlight = useRef(false);
  const snapshotKey = JSON.stringify(volumes);
  useEffect(() => { setValues(Object.fromEntries(Object.entries(volumes).map(([key, value]) => [key, value == null ? "" : String(value).replace(".", ",")]))); }, [snapshotKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const keys = stage === "brew" ? ["preBoilL", "postBoilL", "fermenterL"] as const : ["bottledL", "preBoilL", "postBoilL", "fermenterL"] as const;
  const input = (key: keyof VolumeMeasurements) => <label key={key} className="block min-w-0 text-xs text-muted-foreground">{volumeLabels[key]}, л<input className={fieldClass} inputMode="decimal" value={values[key] ?? ""} onChange={e => { setValues(old => ({ ...old, [key]: e.target.value })); setMessage(""); setError(""); }} disabled={busy} aria-label={`${volumeLabels[key]}, л`} /></label>;
  return <section id="batch-volumes" className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
    <h2 className="text-base font-semibold">Объёмы</h2>
    <p className="text-xs text-muted-foreground">Записывайте объёмы, приведённые к 20 °C.</p>
    <form className="space-y-3" onSubmit={async event => {
      event.preventDefault(); if (inFlight.current) return;
      const patch = Object.fromEntries(keys.map(key => [key, values[key]?.trim() ? Number(values[key]!.trim().replace(",", ".")) : null]));
      inFlight.current = true; setBusy(true); setError(""); setMessage("");
      try { const result = await saveBatchVolumesAction(brewBatchId, patch); if (!result.ok) setError(result.message); else { setMessage("Сохранено"); router.refresh(); } }
      catch { setError("Не удалось сохранить объёмы."); } finally { inFlight.current = false; setBusy(false); }
    }}>
      {stage === "brew" ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{keys.map(input)}</div> : <>
        <div className="max-w-xs">{input("bottledL")}</div>
        <details><summary className="cursor-pointer text-xs text-muted-foreground">Замеры при варке</summary><div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">{keys.filter(key => key !== "bottledL").map(input)}</div></details>
      </>}
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" size="sm" disabled={busy}>{busy ? "Сохранение…" : "Сохранить объёмы"}</Button><span role="status" className="text-xs text-success">{message}</span></div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </form>
    {calibration ? <BatchCalibration brewBatchId={brewBatchId} volumes={volumes} {...calibration} /> : null}
  </section>;
}
