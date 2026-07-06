"use client";

// =============================================================================
//  features/brew-controller/components/distill-hero.tsx
//  Герой пульта дистилляции (веб-HMI §7): ДВЕ температуры — куб (primary,
//  крупно) и колонна (назначенный датчик из sensors[], НЕ hxTempC — тот про
//  HERMS/RIMS, §13). Колонна — главный рабочий инструмент дистилляции, поэтому
//  живёт в герое, а не в списке «Датчики»; не назначена → герой честно
//  показывает только куб + инлайн-выбор из физических датчиков (§11: адаптация,
//  не конструктор). Плюс: уставка куба, пилюля клапана отбора (флегма), подпись
//  фракции + таймер (features/brew-controller/distill-console.ts). Живой график
//  — слотом `chart` (тот же приём, что MonitorHero/FermentHero).
// =============================================================================
import { useState } from "react";
import type { ReactNode } from "react";

import type { Telemetry } from "@nb/brewforge-protocol";

import { fractionElapsedLabel } from "@/features/brew-controller/distill-console";
import { stageLabel } from "@/features/brew-controller/stage-labels";

function fmtTemp(c: number): string {
  return `${c.toFixed(1)} °C`;
}

type ColumnReading = { c: number; valid: boolean } | null;

type Props = {
  telemetry: Telemetry | null;
  columnSensorIndex: number | null;
  columnReading: ColumnReading;
  onAssignColumnSensor: (index: number) => void;
  chart?: ReactNode;
  size?: "default" | "kiosk";
};

export function DistillHero({
  telemetry,
  columnSensorIndex,
  columnReading,
  onAssignColumnSensor,
  chart,
  size = "default",
}: Props) {
  const kiosk = size === "kiosk";
  const [pickerOpen, setPickerOpen] = useState(false);

  // Клапан отбора (флегма) — опционален (роль VALVE), тот же паттерн, что
  // StatusStrip/ManualControlCard: поле отсутствует → строку не рисуем.
  const valveOn = telemetry?.valveOn;
  const stage = telemetry?.stageName ?? null;
  const fractionLabel = stage ? stageLabel(stage) : null;
  const elapsedLabel = fractionElapsedLabel(stage, telemetry?.stageElapsedSec ?? 0);

  // Другие физические датчики можно выбрать, только если их больше одного
  // (единственный датчик уже занят кубом, §7).
  const otherSensors = telemetry ? telemetry.sensors.filter((s) => s.i !== columnSensorIndex) : [];
  const canAssign = telemetry !== null && telemetry.sensors.length > 1;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className={kiosk ? "text-base text-muted-foreground" : "text-sm text-muted-foreground"}>Куб</p>
          {telemetry && telemetry.primary.valid ? (
            <p
              className={
                kiosk
                  ? "mt-1 text-[clamp(4rem,17vh,13rem)] font-semibold leading-none tabular-nums text-foreground"
                  : "mt-1 text-6xl font-semibold tabular-nums text-foreground"
              }
            >
              {fmtTemp(telemetry.primary.c)}
            </p>
          ) : (
            // Без валидной телеметрии — компактная «нет данных» вместо гигантского «—» (#21).
            <p className={kiosk ? "mt-1 text-3xl font-medium text-muted-foreground" : "mt-1 text-xl font-medium text-muted-foreground"}>
              нет данных
            </p>
          )}
          <p className={kiosk ? "mt-2 text-base text-muted-foreground" : "mt-1 text-sm text-muted-foreground"}>
            Уставка:{" "}
            <span
              className={
                kiosk ? "text-xl font-medium text-foreground tabular-nums" : "font-medium text-foreground tabular-nums"
              }
            >
              {telemetry ? fmtTemp(telemetry.setpointC) : "—"}
            </span>
          </p>
        </div>

        <div>
          <p className={kiosk ? "text-base text-muted-foreground" : "text-sm text-muted-foreground"}>Колонна</p>
          {columnReading ? (
            <>
              <p
                className={
                  kiosk
                    ? "mt-1 text-[clamp(3rem,11vh,8rem)] font-semibold leading-none tabular-nums text-foreground"
                    : "mt-1 text-4xl font-semibold tabular-nums text-foreground"
                }
              >
                {columnReading.valid ? fmtTemp(columnReading.c) : "нет данных"}
              </p>
              {canAssign ? (
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  className="mt-1 text-xs font-medium text-muted-foreground underline decoration-dotted hover:text-foreground"
                >
                  изменить датчик
                </button>
              ) : null}
            </>
          ) : canAssign ? (
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="mt-2 inline-flex min-h-[44px] items-center rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition hover:bg-accent"
            >
              Назначить датчик колонны
            </button>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">—</p>
          )}

          {pickerOpen && canAssign ? (
            <select
              autoFocus
              defaultValue=""
              onChange={(e) => {
                const idx = Number(e.target.value);
                if (Number.isInteger(idx)) onAssignColumnSensor(idx);
                setPickerOpen(false);
              }}
              className="mt-2 min-h-[44px] w-full max-w-[220px] rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
            >
              <option value="" disabled>
                Выберите датчик…
              </option>
              {otherSensors.map((s) => (
                <option key={s.i} value={s.i}>
                  Датчик {s.i} — {s.valid ? fmtTemp(s.c) : "нет данных"}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {fractionLabel ? (
          <span className="text-sm font-medium text-foreground">
            {fractionLabel}
            {elapsedLabel ? <span className="text-muted-foreground"> · {elapsedLabel}</span> : null}
          </span>
        ) : null}
        {valveOn !== undefined ? (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              valveOn ? "bg-success-subtle text-success-subtle-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            Клапан отбора {valveOn ? "● откр" : "○ закр"}
          </span>
        ) : null}
      </div>

      {telemetry && telemetry.statusLine ? (
        <p
          className={
            kiosk
              ? "mt-4 rounded-lg bg-muted px-3 py-2 text-base text-foreground"
              : "mt-4 rounded-lg bg-muted px-3 py-2 text-sm text-foreground"
          }
        >
          {telemetry.statusLine}
        </p>
      ) : null}

      {chart ? <div className="mt-4">{chart}</div> : null}
    </div>
  );
}
