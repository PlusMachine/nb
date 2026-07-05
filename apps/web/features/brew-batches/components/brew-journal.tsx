"use client";

import React, { useRef, useState } from "react";
import { Flag, Loader2, Plus, Trash2 } from "lucide-react";
import { gravityToSg, sgToGravityUnit } from "@nb/brewing-core";
import { Button } from "@nb/ui";

import {
  addBrewMeasurementAction,
  deleteBrewMeasurementAction,
  setBrewMeasurementFinalAction
} from "@/app/(app)/app/brew-batches/[id]/actions";
import {
  GRAVITY_SG_MAX,
  GRAVITY_SG_MIN,
  type BrewMeasurementDto,
  type BrewMeasurementSummary
} from "@/features/brew-batches/contracts";
import {
  formatGravity,
  gravityUnitLabels,
  toCalculatorGravityUnit,
  type PreferredGravityUnit
} from "@/features/system/gravity-units";

const fmtAbv = (value: number | null) => (value == null ? "—" : `${value.toFixed(1)}%`);
const fmtAtt = (value: number | null) => (value == null ? "—" : `${Math.round(value)}%`);

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtDate = (value: Date) => dateFmt.format(new Date(value));

function StatTile({ label, value, target }: { label: string; value: string; target?: string | null }) {
  return (
    <div className="rounded-xl bg-zinc-50 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-zinc-400">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-zinc-900">{value}</div>
      {target ? <div className="text-[11px] text-zinc-500">цель {target}</div> : null}
    </div>
  );
}

export function BrewJournal({
  brewBatchId,
  measurements,
  summary,
  preferredGravityUnit,
  hideStats = false,
  title = "Журнал замеров"
}: {
  brewBatchId: string;
  measurements: BrewMeasurementDto[];
  summary: BrewMeasurementSummary;
  preferredGravityUnit: PreferredGravityUnit;
  /** Скрыть плитки OG/FG/ABV/сбраживание — уже показаны карточкой «Итог варки». */
  hideStats?: boolean;
  /** Контекстный заголовок секции (OG на варочном дне, FG на брожении). */
  title?: string;
}) {
  const [gravity, setGravity] = useState("");
  const [takenAt, setTakenAt] = useState("");
  const [note, setNote] = useState("");
  const [markFinal, setMarkFinal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // React 18: useTransition.isPending не держится на await серверного экшена,
  // поэтому ведём явный busy-флаг + ref-гард от повторного сабмита.
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const inFlight = useRef(false);

  const target = summary.target;
  const gravityUnit = toCalculatorGravityUnit(preferredGravityUnit);
  const gravityInputMin = sgToGravityUnit(GRAVITY_SG_MIN, gravityUnit);
  const gravityInputMax = sgToGravityUnit(GRAVITY_SG_MAX, gravityUnit);
  const fmtGravity = (value: number | null) => formatGravity(value, preferredGravityUnit);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) {
      return;
    }
    const enteredValue = Number(gravity.replace(",", "."));
    if (!gravity.trim() || !Number.isFinite(enteredValue)) {
      setError("Введите плотность.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await addBrewMeasurementAction(brewBatchId, {
        gravitySg: String(gravityToSg(enteredValue, gravityUnit)),
        // datetime-local — наивное локальное время; переводим в абсолютный момент
        // (ISO с таймзоной браузера), иначе сервер распарсит его в своей TZ.
        takenAt: takenAt ? new Date(takenAt).toISOString() : null,
        note: note || null,
        isFinal: markFinal
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setGravity("");
      setTakenAt("");
      setNote("");
      setMarkFinal(false);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setDeletingId(id);
    setError(null);
    try {
      const result = await deleteBrewMeasurementAction(brewBatchId, id);
      if (!result.ok) {
        setError(result.message);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
      setDeletingId(null);
    }
  };

  const toggleFinal = async (id: string, next: boolean) => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setTogglingId(id);
    setError(null);
    try {
      const result = await setBrewMeasurementFinalAction(brewBatchId, id, next);
      if (!result.ok) {
        setError(result.message);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
      setTogglingId(null);
    }
  };

  return (
    <section id="brew-journal" className="space-y-4 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-900">{title}</h2>

      {/* Плитки OG/FG/ABV — только когда есть замеры: до первого замера прочерки
          «—» лишь создают шум (нечего показывать, ничего ещё не произошло). */}
      {!hideStats && measurements.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="OG" value={fmtGravity(summary.og)} target={target?.og != null ? fmtGravity(target.og) : null} />
          <StatTile label="FG" value={fmtGravity(summary.fg)} target={target?.fg != null ? fmtGravity(target.fg) : null} />
          <StatTile label="ABV" value={fmtAbv(summary.abv)} target={target?.abv != null ? fmtAbv(target.abv) : null} />
          <StatTile label="Сбраживание" value={fmtAtt(summary.apparentAttenuation)} />
        </div>
      ) : null}

      {/* Форма добавления замера */}
      <form onSubmit={submit} className="space-y-2 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-zinc-500">Плотность ({gravityUnitLabels[preferredGravityUnit]})</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min={gravityInputMin}
              max={gravityInputMax}
              value={gravity}
              onChange={(event) => setGravity(event.target.value)}
              disabled={busy}
              placeholder={sgToGravityUnit(1.012, gravityUnit).toString()}
              aria-label={`Плотность, ${gravityUnitLabels[preferredGravityUnit]}`}
              className="h-9 w-28 rounded-md border border-zinc-200 px-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-zinc-500">Когда (по умолч. — сейчас)</span>
            <input
              type="datetime-local"
              value={takenAt}
              onChange={(event) => setTakenAt(event.target.value)}
              disabled={busy}
              aria-label="Когда сделан замер"
              className="h-9 rounded-md border border-zinc-200 px-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
          </label>
          <label className="flex min-w-[8rem] flex-1 flex-col gap-1">
            <span className="text-[11px] text-zinc-500">Заметка</span>
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={busy}
              placeholder="напр. внёс дрожжи"
              maxLength={500}
              aria-label="Заметка к замеру"
              className="h-9 w-full rounded-md border border-zinc-200 px-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
          </label>
          <Button type="submit" size="sm" disabled={busy}>
            {busy && !deletingId && !togglingId ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            Добавить
          </Button>
        </div>
        <label className="flex w-fit items-center gap-2 text-xs text-zinc-600">
          <input
            type="checkbox"
            checked={markFinal}
            onChange={(event) => setMarkFinal(event.target.checked)}
            disabled={busy}
            className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
          />
          Это финальный замер (FG)
        </label>
        {error ? <p role="alert" className="text-xs text-rose-600">{error}</p> : null}
      </form>

      {/* История замеров */}
      {measurements.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-center text-sm text-zinc-500">
          Пока нет замеров. Внесите начальную плотность (OG), затем финальную (FG) — посчитаем ABV и сбраживание.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {measurements.map((measurement, index) => {
            const tag = measurement.isFinal ? "FG" : index === 0 ? "OG" : null;
            return (
              <li key={measurement.id} className="flex items-center gap-3 py-2">
                <span className="w-16 shrink-0 text-base font-semibold tabular-nums text-zinc-900">
                  {fmtGravity(measurement.gravitySg)}
                </span>
                {tag ? (
                  <span className="shrink-0 rounded-full bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">{tag}</span>
                ) : null}
                {/* Время форматируется в TZ браузера → подавляем hydration-варнинг
                    (SSR-рендер клиентского компонента идёт в TZ сервера). */}
                <span suppressHydrationWarning className="shrink-0 text-xs text-zinc-500">{fmtDate(measurement.takenAt)}</span>
                {measurement.note ? <span className="min-w-0 flex-1 truncate text-sm text-zinc-600">{measurement.note}</span> : <span className="flex-1" />}
                <button
                  type="button"
                  onClick={() => toggleFinal(measurement.id, !measurement.isFinal)}
                  disabled={busy}
                  aria-label={measurement.isFinal ? "Снять отметку FG" : "Отметить финальным (FG)"}
                  title={measurement.isFinal ? "Снять отметку FG" : "Отметить финальным (FG)"}
                  className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition disabled:opacity-60 ${measurement.isFinal ? "text-amber-600 hover:bg-amber-50" : "text-zinc-300 hover:bg-zinc-50 hover:text-zinc-500"}`}
                >
                  {togglingId === measurement.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Flag className={`h-4 w-4 ${measurement.isFinal ? "fill-amber-500" : ""}`} aria-hidden />}
                </button>
                <button
                  type="button"
                  onClick={() => remove(measurement.id)}
                  disabled={busy}
                  aria-label="Удалить замер"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-60"
                >
                  {deletingId === measurement.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
