"use client";

// =============================================================================
//  features/brew-controller/components/ferment-hero.tsx
//  Герой пульта ферментации (веб-HMI §8): крупная температура + уставка, текущая
//  ступень профиля + «день N из M» (недельный процесс — отсчёт в днях, не в
//  минутах, в отличие от MonitorHero варки/дистилляции), следующая ступень,
//  компактная пилюля охлаждения (+ отсчёт защиты компрессора). Живой график
//  план/факт — слотом `chart` (тот же приём, что MonitorHero: герой не владеет
//  его данными). Презентационный — читает готовый снимок телеметрии + прогресс
//  профиля (features/brew-controller/ferment-profile.ts).
// =============================================================================
import type { ReactNode } from "react";

import type { Telemetry } from "@nb/brewforge-protocol";

import type { FermentStepView } from "@/features/brew-controller/ferment-profile";

function fmtTemp(c: number): string {
  return `${c.toFixed(1)} °C`;
}

/** coolLockS телеметрии (сек, анти-короткий-цикл компрессора) → «м:сс». */
function fmtCoolLock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

type Props = {
  telemetry: Telemetry | null;
  current: FermentStepView | null;
  next: FermentStepView | null;
  dayLabel: string | null;
  chart?: ReactNode;
  size?: "default" | "kiosk";
};

export function FermentHero({ telemetry, current, next, dayLabel, chart, size = "default" }: Props) {
  const kiosk = size === "kiosk";
  // coolOn — опционально (только роль COOLER, ферментация): поле отсутствует →
  // undefined → строку не рисуем (§П1 пакета 4-B, тот же приём, что StatusStrip).
  const coolOn = telemetry?.coolOn;
  const coolLockS = telemetry?.coolLockS;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className={kiosk ? "text-base text-zinc-500" : "text-sm text-zinc-500"}>Температура</p>
          <p
            className={
              kiosk
                ? "mt-1 text-[clamp(4rem,17vh,13rem)] font-semibold leading-none tabular-nums text-zinc-950"
                : "mt-1 text-6xl font-semibold tabular-nums text-zinc-950"
            }
          >
            {telemetry && telemetry.primary.valid ? fmtTemp(telemetry.primary.c) : "—"}
          </p>
          <p className={kiosk ? "mt-2 text-base text-zinc-500" : "mt-1 text-sm text-zinc-500"}>
            Уставка:{" "}
            <span
              className={
                kiosk ? "text-xl font-medium text-zinc-700 tabular-nums" : "font-medium text-zinc-700 tabular-nums"
              }
            >
              {telemetry ? fmtTemp(telemetry.setpointC) : "—"}
            </span>
          </p>
        </div>
        <div className="text-right">
          {current ? (
            <>
              <p className={kiosk ? "text-2xl font-semibold text-zinc-950" : "text-lg font-semibold text-zinc-950"}>
                {current.label}
              </p>
              {dayLabel ? (
                <p className={kiosk ? "mt-1 text-lg text-zinc-500 tabular-nums" : "mt-1 text-sm text-zinc-500 tabular-nums"}>
                  {dayLabel}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm font-medium text-zinc-500">Профиль не запущен</p>
          )}
          {next ? (
            <p className="mt-2 text-xs text-zinc-500">
              след. ступень: <span className="font-medium text-zinc-700">{next.label} {fmtTemp(next.tempC)}</span>
            </p>
          ) : null}
        </div>
      </div>

      {coolOn !== undefined ? (
        <p className="mt-4">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              coolOn ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-500"
            }`}
          >
            Охлаждение {coolOn ? "работает" : "выкл"}
            {!coolOn && coolLockS !== undefined && coolLockS > 0
              ? ` · защита компрессора ${fmtCoolLock(coolLockS)}`
              : ""}
          </span>
        </p>
      ) : null}

      {telemetry && telemetry.statusLine ? (
        <p
          className={
            kiosk
              ? "mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-base text-zinc-700"
              : "mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700"
          }
        >
          {telemetry.statusLine}
        </p>
      ) : null}

      {chart ? <div className="mt-4">{chart}</div> : null}
    </div>
  );
}
