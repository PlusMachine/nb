"use client";

// =============================================================================
//  features/brew-controller/components/monitor-hero.tsx
//  Герой пульта: крупная текущая температура + уставка и текущая стадия/таймер.
//  По спеке редизайна L2 (§5) — слияние отсчёта и живого графика; график
//  передаётся слотом `chart` (сам подтягивает историю), чтобы hero оставался
//  презентационным и не владел источником данных.
//
//  size="kiosk" (веб-HMI §9): та же разметка/данные, крупнее масштаб — темп-ра
//  читается с 2–3 м (clamp по vh), уставка/стадия/таймер пропорционально крупнее.
//  Никаких новых данных, только типографика.
// =============================================================================
import type { ReactNode } from "react";

import type { Telemetry } from "@nb/brewforge-protocol";

import { stageLabel } from "@/features/brew-controller/stage-labels";

function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function fmtTemp(c: number): string {
  return `${c.toFixed(1)} °C`;
}

type Props = {
  telemetry: Telemetry | null;
  /** Локально досчитанный остаток текущей стадии (сек). */
  remaining: number;
  /** Живой график (слот) — вставляется под отсчёт; hero не владеет его данными. */
  chart?: ReactNode;
  /** "kiosk" — крупнее (читается с 2–3 м), см. баннер файла. По умолчанию "default". */
  size?: "default" | "kiosk";
};

export function MonitorHero({ telemetry, remaining, chart, size = "default" }: Props) {
  const kiosk = size === "kiosk";
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4">
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
            // Без валидной телеметрии не рисуем гигантский «—» (читался как баг-плашка,
            // UX-находка #21) — компактная приглушённая подпись «нет данных».
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
          <p className={kiosk ? "text-base text-muted-foreground" : "text-sm text-muted-foreground"}>Стадия</p>
          <p className={kiosk ? "mt-1 text-4xl font-semibold text-foreground" : "mt-1 text-2xl font-semibold text-foreground"}>
            {telemetry ? stageLabel(telemetry.stageName) : "—"}
          </p>
          <p className={kiosk ? "mt-1 text-lg text-muted-foreground tabular-nums" : "mt-1 text-sm text-muted-foreground tabular-nums"}>
            Осталось {telemetry ? fmtClock(remaining) : "—"} · прошло{" "}
            {telemetry ? fmtClock(telemetry.stageElapsedSec) : "—"}
          </p>
        </div>
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
