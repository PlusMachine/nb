"use client";

// =============================================================================
//  features/brew-controller/components/monitor-hero.tsx
//  Герой пульта: крупная текущая температура + уставка и текущая стадия/таймер.
//  По спеке редизайна L2 (§5) — слияние отсчёта и живого графика; график
//  передаётся слотом `chart` (сам подтягивает историю), чтобы hero оставался
//  презентационным и не владел источником данных.
// =============================================================================
import type { ReactNode } from "react";

import type { Telemetry } from "@nb/brewforge-protocol";

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
};

export function MonitorHero({ telemetry, remaining, chart }: Props) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-500">Температура</p>
          <p className="mt-1 text-6xl font-semibold tabular-nums text-zinc-950">
            {telemetry && telemetry.primary.valid ? fmtTemp(telemetry.primary.c) : "—"}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Уставка:{" "}
            <span className="font-medium text-zinc-700 tabular-nums">
              {telemetry ? fmtTemp(telemetry.setpointC) : "—"}
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-zinc-500">Стадия</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-950">{telemetry ? telemetry.stageName : "—"}</p>
          <p className="mt-1 text-sm text-zinc-500 tabular-nums">
            Осталось {telemetry ? fmtClock(remaining) : "—"} · прошло{" "}
            {telemetry ? fmtClock(telemetry.stageElapsedSec) : "—"}
          </p>
        </div>
      </div>

      {telemetry && telemetry.statusLine ? (
        <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">{telemetry.statusLine}</p>
      ) : null}

      {chart ? <div className="mt-4">{chart}</div> : null}
    </div>
  );
}
