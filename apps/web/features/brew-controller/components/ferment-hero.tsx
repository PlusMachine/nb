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
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className={kiosk ? "text-base text-muted-foreground" : "text-sm text-muted-foreground"}>Температура</p>
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
        <div className="text-right">
          {current ? (
            <>
              <p className={kiosk ? "text-2xl font-semibold text-foreground" : "text-lg font-semibold text-foreground"}>
                {current.label}
              </p>
              {dayLabel ? (
                <p className={kiosk ? "mt-1 text-lg text-muted-foreground tabular-nums" : "mt-1 text-sm text-muted-foreground tabular-nums"}>
                  {dayLabel}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm font-medium text-muted-foreground">Профиль не запущен</p>
          )}
          {next ? (
            <p className="mt-2 text-xs text-muted-foreground">
              след. ступень: <span className="font-medium text-foreground">{next.label} {fmtTemp(next.tempC)}</span>
            </p>
          ) : null}
        </div>
      </div>

      {coolOn !== undefined ? (
        <p className="mt-4">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              coolOn ? "bg-success-subtle text-success-subtle-foreground" : "bg-muted text-muted-foreground"
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
