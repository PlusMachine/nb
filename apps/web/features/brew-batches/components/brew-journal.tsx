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
import { NumericInput } from "@/components/shared/numeric-input";
import { resolveBrewGravityPlaceholderSg } from "@/features/brew-batches/brew-day";
import {
  GRAVITY_SG_MAX,
  GRAVITY_SG_MIN,
  type BrewMeasurementDto,
  type BrewMeasurementKind,
  type BrewMeasurementSummary
} from "@/features/brew-batches/contracts";
import {
  formatGravity,
  formatGravitySecondary,
  gravityUnitLabels,
  toCalculatorGravityUnit,
  type PreferredGravityUnit
} from "@/features/system/gravity-units";

const fmtAbv = (value: number | null) => (value == null ? "—" : `${value.toFixed(1)}%`);
const fmtAtt = (value: number | null) => (value == null ? "—" : `${Math.round(value)}%`);

// Подсказка в поле ввода — голое число: единица уже стоит в подписи поля
// («Плотность (°P)»), и formatGravity с её суффиксом здесь только шумел бы.
const fmtGravityPlaceholder = (sg: number, unit: PreferredGravityUnit): string => {
  if (unit === "sg") {
    return sg.toFixed(3);
  }
  const converted = sgToGravityUnit(sg, toCalculatorGravityUnit(unit)).toFixed(1);
  // sgToPlato(1.000) ≈ −0.003 — гасим «−0.0» у совсем сухих целей (как formatGravity).
  return Number(converted) === 0 ? (0).toFixed(1) : converted;
};

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtDate = (value: Date) => dateFmt.format(new Date(value));

function StatTile({
  label,
  value,
  secondary,
  target
}: {
  label: string;
  value: string;
  /** Значение во второй (дублирующей) единице плотности — мелким muted-текстом рядом с основным. */
  secondary?: string | null;
  target?: string | null;
}) {
  return (
    <div className="rounded-xl bg-muted px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <div className="text-lg font-semibold tabular-nums text-foreground">{value}</div>
        {secondary ? <div className="text-[11px] text-muted-foreground">{secondary}</div> : null}
      </div>
      {target ? <div className="text-[11px] text-muted-foreground">цель {target}</div> : null}
    </div>
  );
}

export function BrewJournal({
  brewBatchId,
  measurements,
  summary,
  preferredGravityUnit,
  measurementKind,
  hideStats = false,
  title = "Журнал замеров"
}: {
  brewBatchId: string;
  measurements: BrewMeasurementDto[];
  summary: BrewMeasurementSummary;
  preferredGravityUnit: PreferredGravityUnit;
  /** Какой замер ждём в этом акте — задаёт подсказку в поле плотности (см. brew-day.ts). */
  measurementKind: BrewMeasurementKind;
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
  const placeholderSg = resolveBrewGravityPlaceholderSg(measurementKind, target);
  const gravityPlaceholder = placeholderSg == null ? undefined : fmtGravityPlaceholder(placeholderSg, preferredGravityUnit);
  const takenAtDate = takenAt ? new Date(takenAt) : null;
  const takenAtPreview = takenAtDate && !Number.isNaN(takenAtDate.getTime()) ? fmtDate(takenAtDate) : null;

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
    const gravitySg = gravityToSg(enteredValue, gravityUnit);
    // Проверяем диапазон уже в SG (как валидирует сервер), но сообщение — в единице
    // пользователя, иначе °P/°Bx на экране расходится с SG-числами в ошибке.
    if (gravitySg < GRAVITY_SG_MIN) {
      setError(`Плотность не меньше ${fmtGravity(GRAVITY_SG_MIN)}.`);
      return;
    }
    if (gravitySg > GRAVITY_SG_MAX) {
      setError(`Плотность не больше ${fmtGravity(GRAVITY_SG_MAX)}.`);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await addBrewMeasurementAction(brewBatchId, {
        gravitySg: String(gravitySg),
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
    <section id="brew-journal" className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>

      {/* Плитки OG/FG/ABV — только когда есть замеры: до первого замера прочерки
          «—» лишь создают шум (нечего показывать, ничего ещё не произошло). */}
      {!hideStats && measurements.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            label="OG"
            value={fmtGravity(summary.og)}
            secondary={formatGravitySecondary(summary.og, preferredGravityUnit)}
            target={target?.og != null ? fmtGravity(target.og) : null}
          />
          <StatTile
            label="FG"
            value={fmtGravity(summary.fg)}
            secondary={formatGravitySecondary(summary.fg, preferredGravityUnit)}
            target={target?.fg != null ? fmtGravity(target.fg) : null}
          />
          <StatTile label="ABV" value={fmtAbv(summary.abv)} target={target?.abv != null ? fmtAbv(target.abv) : null} />
          <StatTile label="Сбраживание" value={fmtAtt(summary.apparentAttenuation)} />
        </div>
      ) : null}

      {/* Форма добавления замера */}
      <form onSubmit={submit} className="space-y-2 rounded-xl border border-border bg-muted/60 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Плотность ({gravityUnitLabels[preferredGravityUnit]})</span>
            <NumericInput
              min={gravityInputMin}
              max={gravityInputMax}
              value={gravity}
              onChange={(event) => setGravity(event.target.value)}
              disabled={busy}
              placeholder={gravityPlaceholder}
              aria-label={`Плотность, ${gravityUnitLabels[preferredGravityUnit]}`}
              className="h-9 w-28 rounded-md border border-border px-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Когда (по умолч. — сейчас)</span>
            <input
              type="datetime-local"
              value={takenAt}
              onChange={(event) => setTakenAt(event.target.value)}
              disabled={busy}
              aria-label="Когда сделан замер"
              className="h-9 rounded-md border border-border px-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
            />
          </label>
          <label className="flex min-w-[8rem] flex-1 flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Заметка</span>
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={busy}
              placeholder="напр. внёс дрожжи"
              maxLength={500}
              aria-label="Заметка к замеру"
              className="h-9 w-full rounded-md border border-border px-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
            />
          </label>
          <Button type="submit" size="sm" disabled={busy}>
            {busy && !deletingId && !togglingId ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            Добавить
          </Button>
        </div>
        {takenAtPreview ? <p className="text-xs text-muted-foreground">{takenAtPreview}</p> : null}
        <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={markFinal}
            onChange={(event) => setMarkFinal(event.target.checked)}
            disabled={busy}
            className="h-3.5 w-3.5 rounded border-border text-foreground focus:ring-ring"
          />
          Это финальный замер (FG)
        </label>
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      </form>

      {/* История замеров */}
      {measurements.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted p-4 text-center text-sm text-muted-foreground">
          Пока нет замеров. Внесите начальную плотность (OG), затем финальную (FG) — посчитаем ABV и сбраживание.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {measurements.map((measurement, index) => {
            const tag = measurement.isFinal ? "FG" : index === 0 ? "OG" : null;
            return (
              <li key={measurement.id} className="flex items-center gap-3 py-2">
                <span className="w-16 shrink-0 text-base font-semibold tabular-nums text-foreground">
                  {fmtGravity(measurement.gravitySg)}
                </span>
                {tag ? (
                  <span className="shrink-0 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background">{tag}</span>
                ) : null}
                {/* Время форматируется в TZ браузера → подавляем hydration-варнинг
                    (SSR-рендер клиентского компонента идёт в TZ сервера). */}
                <span suppressHydrationWarning className="shrink-0 text-xs text-muted-foreground">{fmtDate(measurement.takenAt)}</span>
                {measurement.note ? <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{measurement.note}</span> : <span className="flex-1" />}
                <button
                  type="button"
                  onClick={() => toggleFinal(measurement.id, !measurement.isFinal)}
                  disabled={busy}
                  aria-label={measurement.isFinal ? "Снять отметку FG" : "Отметить финальным (FG)"}
                  title={measurement.isFinal ? "Снять отметку FG" : "Отметить финальным (FG)"}
                  className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition disabled:opacity-60 ${measurement.isFinal ? "text-warning-subtle-foreground hover:bg-warning-subtle" : "text-muted-foreground hover:bg-muted hover:text-muted-foreground"}`}
                >
                  {togglingId === measurement.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Flag className={`h-4 w-4 ${measurement.isFinal ? "fill-warning" : ""}`} aria-hidden />}
                </button>
                <button
                  type="button"
                  onClick={() => remove(measurement.id)}
                  disabled={busy}
                  aria-label="Удалить замер"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-destructive-subtle hover:text-destructive disabled:opacity-60"
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
